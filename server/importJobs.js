import { persistImportedFile } from './fileGraphService.js'
import { extractFallbackGraph } from './fallbackExtractor.js'
import { extractWithServerLLM } from './serverLLMExtractor.js'

const jobs = new Map()
const JOB_CONCURRENCY = 3

function makeId(prefix = 'job') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function now() {
  return Date.now()
}

function cloneJob(job) {
  return {
    ...JSON.parse(JSON.stringify(job)),
    items: (job.items || []).map(item => ({
      id: item.id,
      fileName: item.fileName,
      fileType: item.fileType,
      fileSize: item.fileSize,
      status: item.status,
      currentStage: item.currentStage,
      stages: item.stages,
      logs: item.logs,
      summary: item.summary,
      error: item.error,
      result: item.result,
      updatedAt: item.updatedAt
    }))
  }
}

function appendLog(target, message) {
  const time = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  target.logs.push(`${time} ${message}`)
}

function setStage(item, stageKey, status, detail = '') {
  item.currentStage = stageKey
  item.stages = item.stages.map(stage => {
    if (stage.key === stageKey) {
      return { ...stage, status, detail: detail || stage.detail }
    }
    if (status === 'running' && stage.status === 'running') {
      return { ...stage, status: 'done' }
    }
    return stage
  })
}

function summarizeGraph(result, method) {
  const nodes = result.nodes || []
  return {
    method,
    nodeCount: nodes.length,
    edgeCount: (result.edges || []).length,
    entityLabels: nodes.filter(node => node.type !== '事件').slice(0, 6).map(node => node.label),
    eventLabels: nodes.filter(node => node.type === '事件').slice(0, 4).map(node => node.label)
  }
}

function createItem(file, options = {}) {
  return {
    id: file.id || makeId('file'),
    fileName: file.fileName,
    fileType: file.fileType || 'txt',
    fileSize: Number(file.fileSize || String(file.content || '').length),
    content: String(file.content || ''),
    precomputedGraph: file.precomputedGraph || null,
    status: 'queued',
    currentStage: 'receive',
    stages: [
      { key: 'receive', label: '文件接收', status: 'done', detail: `已接收 ${file.fileName}` },
      { key: 'parse', label: '文本解析', status: 'idle', detail: '' },
      { key: 'extract', label: '意图抽取', status: 'idle', detail: '' },
      { key: 'persist', label: '图谱更新', status: 'idle', detail: '' },
      { key: 'complete', label: '导入完成', status: 'idle', detail: '' }
    ],
    logs: [],
    summary: null,
    error: '',
    result: null,
    options
  }
}

async function extractGraphForItem(job, item) {
  if (item.precomputedGraph?.nodes || item.precomputedGraph?.edges) {
    appendLog(item, '使用预解析结构化图结果')
    return {
      graph: {
        nodes: item.precomputedGraph.nodes || [],
        edges: item.precomputedGraph.edges || []
      },
      method: 'structured-precomputed'
    }
  }

  if (!item.content.trim()) {
    return {
      graph: { nodes: [], edges: [] },
      method: 'empty-content'
    }
  }

  if (job.options.useLLMExtraction === false) {
    appendLog(item, '已禁用模型抽取，回退到保守规则')
    return {
      graph: extractFallbackGraph(item.content),
      method: 'fallback-rule'
    }
  }

  try {
    appendLog(item, '开始按工作区意图调用服务端模型')
    const graph = await extractWithServerLLM(item.content, {
      workspaceIntent: job.intentQuery,
      extractionProfile: job.intentProfile,
      promptOverride: job.options.extractionPrompt || '',
      modelName: job.options.modelName,
      temperature: job.options.temperature,
      maxTokens: job.options.maxTokens
    })
    const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0
    const edgeCount = Array.isArray(graph?.edges) ? graph.edges.length : 0
    if (nodeCount === 0 && edgeCount === 0) {
      appendLog(item, '模型返回空图，回退到保守规则')
      return {
        graph: extractFallbackGraph(item.content),
        method: 'fallback-rule'
      }
    }
    return { graph, method: 'server-llm' }
  } catch (error) {
    appendLog(item, `模型抽取失败，回退到保守规则：${error.message}`)
    return {
      graph: extractFallbackGraph(item.content),
      method: 'fallback-rule'
    }
  }
}

async function processItem(job, item) {
  item.status = 'running'
  item.updatedAt = now()

  setStage(item, 'parse', 'running', '正在接收和整理文本内容')
  appendLog(item, '开始整理文件内容')
  setStage(item, 'parse', 'done', `已准备 ${item.content.length} 个字符`)

  setStage(item, 'extract', 'running', '正在抽取实体、事件和关系')
  const { graph, method } = await extractGraphForItem(job, item)
  item.summary = summarizeGraph(graph, method)
  setStage(
    item,
    'extract',
    'done',
    `抽取到 ${item.summary.nodeCount} 个节点，${item.summary.edgeCount} 条关系`
  )

  setStage(item, 'persist', 'running', '正在更新工作区图谱')
  appendLog(item, '开始写入段落、mention 和 canonical 图数据')
  const persisted = await persistImportedFile({
    graphId: job.graphId,
    id: item.id,
    fileName: item.fileName,
    content: item.content,
    fileType: item.fileType,
    fileSize: item.fileSize,
    nodes: graph.nodes,
    edges: graph.edges
  })
  item.result = persisted
  setStage(
    item,
    'persist',
    'done',
    `图谱更新为 ${persisted.graph.nodeCount} 个节点，${persisted.graph.edgeCount} 条关系`
  )
  setStage(item, 'complete', 'done', '导入完成')
  appendLog(item, '文件导入完成')

  item.status = 'done'
  item.updatedAt = now()
}

async function runJob(job) {
  job.status = 'running'
  job.startedAt = now()
  job.updatedAt = now()

  let index = 0
  const workers = Array.from({ length: Math.min(JOB_CONCURRENCY, job.items.length) }, async () => {
    while (index < job.items.length) {
      const currentIndex = index
      index += 1
      const item = job.items[currentIndex]
      try {
        await processItem(job, item)
        job.completedFiles += 1
      } catch (error) {
        item.status = 'error'
        item.error = error.message
        item.updatedAt = now()
        const runningStage = item.stages.find(stage => stage.status === 'running')?.key || 'persist'
        setStage(item, runningStage, 'error', error.message)
        appendLog(item, `处理失败：${error.message}`)
        job.failedFiles += 1
      }
      job.updatedAt = now()
    }
  })

  await Promise.all(workers)
  job.status = job.failedFiles > 0 ? 'completed-with-errors' : 'completed'
  job.finishedAt = now()
  job.updatedAt = now()
}

export function createImportJob({
  graphId,
  intentQuery = '',
  intentProfile = null,
  files = [],
  options = {}
}) {
  const job = {
    id: makeId('job'),
    graphId,
    intentQuery,
    intentProfile,
    options,
    status: 'queued',
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    finishedAt: null,
    items: files.map(file => createItem(file, options))
  }

  jobs.set(job.id, job)
  queueMicrotask(() => {
    runJob(job).catch(error => {
      job.status = 'failed'
      job.updatedAt = now()
      job.finishedAt = now()
      job.error = error.message
    })
  })
  return cloneJob(job)
}

export function getImportJob(jobId) {
  const job = jobs.get(jobId)
  return job ? cloneJob(job) : null
}
