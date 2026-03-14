import { persistImportedFile } from './fileGraphService.js'
import { extractFallbackGraph } from './fallbackExtractor.js'
import { extractWithServerLLM } from './serverLLMExtractor.js'
import { filterGraphByIntent, focusContentByIntent } from './workspaceIntent.js'

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

function makeStages(fileName, retrying = false) {
  return [
    { key: 'receive', label: '文件接收', status: 'done', detail: retrying ? `重新准备 ${fileName}` : `已接收 ${fileName}` },
    { key: 'parse', label: '文本解析', status: 'idle', detail: '' },
    { key: 'extract', label: '意图抽取', status: 'idle', detail: '' },
    { key: 'persist', label: '更新图谱', status: 'idle', detail: '' },
    { key: 'complete', label: '导入完成', status: 'idle', detail: '' }
  ]
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
    stages: makeStages(file.fileName),
    logs: [],
    summary: null,
    error: '',
    result: null,
    options,
    updatedAt: now()
  }
}

function resetItemForRetry(item) {
  item.status = 'queued'
  item.currentStage = 'receive'
  item.stages = makeStages(item.fileName, true)
  item.logs = []
  item.summary = null
  item.error = ''
  item.result = null
  item.updatedAt = now()
}

function recomputeJobStats(job) {
  job.completedFiles = job.items.filter(item => item.status === 'done').length
  job.failedFiles = job.items.filter(item => item.status === 'error').length
  job.totalFiles = job.items.length
  job.updatedAt = now()
}

function applyIntentFiltering(item, job, graph) {
  const filteredGraph = filterGraphByIntent(graph, job.intentProfile)
  const removedNodes = (graph.nodes || []).length - (filteredGraph.nodes || []).length
  const removedEdges = (graph.edges || []).length - (filteredGraph.edges || []).length
  if (removedNodes > 0 || removedEdges > 0) {
    appendLog(item, `按工作区意图过滤，移除 ${Math.max(removedNodes, 0)} 个节点、${Math.max(removedEdges, 0)} 条关系`)
  }
  return filteredGraph
}

async function extractGraphForItem(job, item) {
  if (item.precomputedGraph?.nodes || item.precomputedGraph?.edges) {
    appendLog(item, '使用结构化预处理结果')
    return {
      graph: applyIntentFiltering(item, job, {
        nodes: item.precomputedGraph.nodes || [],
        edges: item.precomputedGraph.edges || []
      }),
      method: 'structured-precomputed'
    }
  }

  if (!item.content.trim()) {
    return {
      graph: { nodes: [], edges: [] },
      method: 'empty-content'
    }
  }

  const focused = focusContentByIntent(item.content, job.intentProfile)
  if (focused.filtered) {
    appendLog(item, `按工作区意图筛到 ${focused.matchedParagraphs}/${focused.totalParagraphs} 段相关内容`)
  }
  if (!focused.content.trim()) {
    appendLog(item, '该文件未命中当前工作区意图，跳过节点和关系抽取')
    return {
      graph: { nodes: [], edges: [] },
      method: 'intent-filtered'
    }
  }

  if (job.options.useLLMExtraction === false) {
    appendLog(item, '已禁用模型抽取，回退到保守规则')
    return {
      graph: applyIntentFiltering(item, job, extractFallbackGraph(focused.content)),
      method: 'fallback-rule'
    }
  }

  try {
    appendLog(item, '开始按工作区意图调用服务端模型')
    const graph = await extractWithServerLLM(focused.content, {
      workspaceIntent: job.intentQuery,
      extractionProfile: job.intentProfile,
      modelName: job.options.modelName,
      temperature: job.options.temperature,
      maxTokens: job.options.maxTokens
    })
    const filteredGraph = applyIntentFiltering(item, job, graph)
    const nodeCount = Array.isArray(filteredGraph?.nodes) ? filteredGraph.nodes.length : 0
    const edgeCount = Array.isArray(filteredGraph?.edges) ? filteredGraph.edges.length : 0
    if (nodeCount === 0 && edgeCount === 0) {
      appendLog(item, '模型返回空图或被意图过滤为空，回退到保守规则')
      return {
        graph: applyIntentFiltering(item, job, extractFallbackGraph(focused.content)),
        method: 'fallback-rule'
      }
    }
    return { graph: filteredGraph, method: 'server-llm' }
  } catch (error) {
    appendLog(item, `模型抽取失败，已回退到规则解析：${error.message}`)
    return {
      graph: applyIntentFiltering(item, job, extractFallbackGraph(focused.content)),
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
  setStage(item, 'extract', 'done', `抽取到 ${item.summary.nodeCount} 个节点，${item.summary.edgeCount} 条关系`)

  setStage(item, 'persist', 'running', '正在更新当前工作区图谱')
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
  setStage(item, 'persist', 'done', `图谱更新为 ${persisted.graph.nodeCount} 个节点，${persisted.graph.edgeCount} 条关系`)
  setStage(item, 'complete', 'done', '导入完成')
  appendLog(item, '文件导入完成')

  item.status = 'done'
  item.updatedAt = now()
}

async function runJob(job) {
  const pendingItems = job.items.filter(item => item.status === 'queued')
  if (pendingItems.length === 0) {
    recomputeJobStats(job)
    job.status = job.failedFiles > 0 ? 'completed-with-errors' : 'completed'
    job.finishedAt = now()
    return
  }

  job.status = 'running'
  job.startedAt = job.startedAt || now()
  job.finishedAt = null
  job.updatedAt = now()

  let index = 0
  const workers = Array.from({ length: Math.min(JOB_CONCURRENCY, pendingItems.length) }, async () => {
    while (index < pendingItems.length) {
      const currentIndex = index
      index += 1
      const item = pendingItems[currentIndex]
      try {
        await processItem(job, item)
      } catch (error) {
        item.status = 'error'
        item.error = error.message
        item.updatedAt = now()
        const runningStage = item.stages.find(stage => stage.status === 'running')?.key || 'persist'
        setStage(item, runningStage, 'error', error.message)
        appendLog(item, `处理失败：${error.message}`)
      }
      recomputeJobStats(job)
    }
  })

  await Promise.all(workers)
  recomputeJobStats(job)
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

export function retryImportJob(jobId, fileIds = []) {
  const job = jobs.get(jobId)
  if (!job) return null
  if (job.status === 'running') {
    throw new Error('导入任务仍在执行，暂时不能重试')
  }

  const targetIds = new Set((Array.isArray(fileIds) ? fileIds : []).filter(Boolean))
  const targets = job.items.filter(item => {
    if (targetIds.size > 0) return targetIds.has(item.id)
    return item.status === 'error'
  })

  if (targets.length === 0) {
    throw new Error('没有可重试的失败文件')
  }

  for (const item of targets) {
    resetItemForRetry(item)
  }

  recomputeJobStats(job)
  job.status = 'queued'
  job.error = ''
  job.finishedAt = null
  job.updatedAt = now()

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
