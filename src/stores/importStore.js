import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useGraphStore } from './graphStore'
import { useSettingsStore } from './settingsStore'
import { parseJSON } from '@/services/parsers/jsonParser'
import { parseCSV } from '@/services/parsers/csvParser'
import { parseTXT } from '@/services/parsers/txtParser'
import { parseMD } from '@/services/parsers/mdParser'
import { parsePDF } from '@/services/parsers/pdfParser'
import { extractWithLLM } from '@/services/llmExtractor'
import { saveFileContent } from '@/services/apiClient'
import { generateId } from '@/utils/idGenerator'

const DEFAULT_STAGES = [
  { key: 'receive', label: '文件接收', status: 'idle', detail: '' },
  { key: 'parse', label: '文本解析', status: 'idle', detail: '' },
  { key: 'extract', label: '意图抽取', status: 'idle', detail: '' },
  { key: 'structure', label: '实体事件识别', status: 'idle', detail: '' },
  { key: 'persist', label: '导入完成', status: 'idle', detail: '' }
]

function cloneStages() {
  return DEFAULT_STAGES.map(item => ({ ...item }))
}

export const useImportStore = defineStore('import', () => {
  const graphStore = useGraphStore()
  const settings = useSettingsStore()

  const parsing = ref(false)
  const extracting = ref(false)
  const parseError = ref(null)
  const lastResult = ref(null)
  const currentFileName = ref('')
  const stages = ref(cloneStages())
  const processLogs = ref([])
  const extractionSummary = ref(null)

  const currentStage = computed(() =>
    stages.value.find(item => item.status === 'running') || null
  )

  const hasActivity = computed(() =>
    Boolean(currentFileName.value || parseError.value || lastResult.value || processLogs.value.length)
  )

  function getExt(fileName) {
    return fileName.split('.').pop().toLowerCase()
  }

  function isUnstructuredType(ext) {
    return ['txt', 'md', 'markdown', 'pdf'].includes(ext)
  }

  function canUseLLM() {
    return settings.useLLMExtraction && settings.isApiConfigured
  }

  function resetProcess(fileName = '') {
    currentFileName.value = fileName
    stages.value = cloneStages()
    processLogs.value = []
    extractionSummary.value = null
    parseError.value = null
  }

  function clearProcess() {
    currentFileName.value = ''
    stages.value = cloneStages()
    processLogs.value = []
    extractionSummary.value = null
    parseError.value = null
    lastResult.value = null
    parsing.value = false
    extracting.value = false
  }

  function updateStage(key, status, detail = '') {
    stages.value = stages.value.map(stage => {
      if (stage.key === key) {
        return { ...stage, status, detail: detail || stage.detail }
      }
      if (status === 'running' && stage.status === 'running') {
        return { ...stage, status: 'done' }
      }
      return stage
    })
  }

  function pushLog(message) {
    const time = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    processLogs.value = [...processLogs.value, `${time} ${message}`]
  }

  function buildSummary(result, method) {
    const nodes = result.nodes || []
    extractionSummary.value = {
      method,
      nodeCount: nodes.length,
      edgeCount: (result.edges || []).length,
      entityLabels: nodes.filter(node => node.type !== '事件').slice(0, 6).map(node => node.label),
      eventLabels: nodes.filter(node => node.type === '事件').slice(0, 4).map(node => node.label)
    }
  }

  function fallbackParse(ext, text) {
    switch (ext) {
      case 'md':
      case 'markdown':
        return parseMD(text)
      case 'txt':
      default:
        return parseTXT(text)
    }
  }

  async function extractPdfText(arrayBuffer) {
    let pdfjsLib
    try {
      pdfjsLib = await import('pdfjs-dist')
      try {
        const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
      }
    } catch {
      return ''
    }

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lines = new Map()
      for (const item of content.items) {
        if (!item.str) continue
        const y = Math.round(item.transform[5])
        if (!lines.has(y)) lines.set(y, [])
        lines.get(y).push(item.str)
      }
      const sorted = Array.from(lines.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, strs]) => strs.join(' '))
      pages.push(sorted.join('\n'))
    }
    return pages.join('\n\n')
  }

  async function parseFile(file) {
    parsing.value = true
    extracting.value = false
    parseError.value = null
    lastResult.value = null
    resetProcess(file.name)

    try {
      if (!graphStore.currentGraphId || !graphStore.currentIntentQuery) {
        throw new Error('请先创建工作区，并填写该工作区的总意图后再导入文档。')
      }

      updateStage('receive', 'running', `已接收 ${file.name}`)
      pushLog(`已接收文件 ${file.name}`)
      updateStage('receive', 'done', `文件大小 ${Math.max(1, Math.round(file.size / 1024))} KB`)

      const ext = getExt(file.name)
      let result
      let fileTextContent = null
      let extractionMethod = '规则解析'

      updateStage('parse', 'running', `正在解析 ${ext.toUpperCase()} 内容`)
      pushLog('开始解析文件内容')

      if (ext === 'json') {
        const text = await file.text()
        fileTextContent = text
        result = parseJSON(text)
      } else if (ext === 'csv') {
        const text = await file.text()
        fileTextContent = text
        result = parseCSV(text)
      } else if (isUnstructuredType(ext) && canUseLLM()) {
        let plainText
        if (ext === 'pdf') {
          const arrayBuffer = await file.arrayBuffer()
          plainText = await extractPdfText(arrayBuffer)
        } else {
          plainText = await file.text()
        }
        fileTextContent = plainText
        updateStage('parse', 'done', `解析得到 ${plainText.length} 个字符`)

        extracting.value = true
        updateStage('extract', 'running', '正在按工作区意图调用模型')
        pushLog('开始按工作区意图抽取实体和事件')
        extractionMethod = 'LLM 意图抽取'

        try {
          result = await extractWithLLM(plainText, settings, {
            workspaceIntent: graphStore.currentIntentQuery,
            fileName: file.name
          })
          updateStage('extract', 'done', '意图抽取完成')
        } catch (llmErr) {
          console.warn('LLM extraction failed, falling back to regex:', llmErr.message)
          pushLog(`模型抽取失败，已回退到规则解析：${llmErr.message}`)
          updateStage('extract', 'done', '模型抽取失败，已回退规则解析')
          extractionMethod = '规则回退解析'
          result = fallbackParse(ext, plainText)
        }

        extracting.value = false
      } else {
        if (ext === 'pdf') {
          const arrayBuffer = await file.arrayBuffer()
          fileTextContent = await extractPdfText(arrayBuffer)
          result = await parsePDF(arrayBuffer)
        } else {
          const text = await file.text()
          fileTextContent = text
          result = fallbackParse(ext, text)
        }
      }

      if (!result) throw new Error(`不支持的文件格式: ${ext}`)

      if (stages.value.find(item => item.key === 'parse')?.status !== 'done') {
        updateStage('parse', 'done', '解析完成')
      }

      updateStage('structure', 'running', '正在整理实体、事件和关系')
      pushLog('开始整理抽取结果')

      lastResult.value = {
        fileName: file.name,
        fileType: ext,
        fileSize: file.size,
        fileTextContent,
        nodes: result.nodes,
        edges: result.edges,
        nodeCount: result.nodes.length,
        edgeCount: result.edges.length
      }

      buildSummary(result, extractionMethod)
      updateStage('structure', 'done', `识别 ${result.nodes.length} 个节点，${result.edges.length} 条关系`)
      updateStage('persist', 'ready', '等待确认导入')
      pushLog(`抽取完成：${result.nodes.length} 个节点，${result.edges.length} 条关系`)
      return lastResult.value
    } catch (error) {
      parseError.value = error.message
      const runningStage = stages.value.find(item => item.status === 'running')?.key || 'parse'
      updateStage(runningStage, 'error', error.message)
      pushLog(`处理失败：${error.message}`)
      throw error
    } finally {
      parsing.value = false
      extracting.value = false
    }
  }

  async function confirmImport() {
    if (!lastResult.value) return

    updateStage('persist', 'running', '正在写入图谱和文档库')
    pushLog('开始写入图谱与段落证据')

    graphStore.mergeGraph(
      { nodes: lastResult.value.nodes, edges: lastResult.value.edges },
      lastResult.value.fileName
    )

    const graphId = graphStore.currentGraphId
    if (graphId && lastResult.value.fileTextContent) {
      try {
        await saveFileContent(graphId, {
          id: generateId('f'),
          fileName: lastResult.value.fileName,
          content: lastResult.value.fileTextContent,
          fileType: lastResult.value.fileType,
          fileSize: lastResult.value.fileSize,
          nodes: lastResult.value.nodes,
          edges: lastResult.value.edges
        })
      } catch (error) {
        console.warn('[importStore] failed to save file content:', error.message)
      }
    }

    updateStage('persist', 'done', '导入完成')
    pushLog('文件已完成导入')

    const imported = lastResult.value
    lastResult.value = null
    return imported
  }

  async function importFiles(files, options = {}) {
    const autoConfirm = Boolean(options.autoConfirm)
    const imported = []
    const errors = []

    for (const file of files || []) {
      try {
        await parseFile(file)
        if (autoConfirm) {
          const result = await confirmImport()
          if (result) imported.push(result)
        }
      } catch (error) {
        errors.push({
          fileName: file?.name || '',
          message: error.message
        })
      }
    }

    return { imported, errors }
  }

  function cancelImport() {
    updateStage('persist', 'idle', '')
    lastResult.value = null
  }

  return {
    parsing,
    extracting,
    parseError,
    lastResult,
    currentFileName,
    currentStage,
    stages,
    processLogs,
    extractionSummary,
    hasActivity,
    parseFile,
    importFiles,
    confirmImport,
    cancelImport,
    clearProcess
  }
})
