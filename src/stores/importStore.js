import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useGraphStore } from './graphStore'
import { useSettingsStore } from './settingsStore'
import { parseJSON } from '@/services/parsers/jsonParser'
import { parseCSV } from '@/services/parsers/csvParser'
import { createImportJobApi, fetchImportJobApi, retryImportJobApi } from '@/services/apiClient'
import { generateId } from '@/utils/idGenerator'

const IMPORT_JOB_STORAGE_KEY = 'zstp-active-import-jobs'

const DEFAULT_STAGES = [
  { key: 'receive', label: '文件接收', status: 'idle', detail: '' },
  { key: 'parse', label: '文本解析', status: 'idle', detail: '' },
  { key: 'extract', label: '意图抽取', status: 'idle', detail: '' },
  { key: 'persist', label: '图谱更新', status: 'idle', detail: '' },
  { key: 'complete', label: '导入完成', status: 'idle', detail: '' }
]

function cloneStages() {
  return DEFAULT_STAGES.map(item => ({ ...item }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function loadPersistedJobs() {
  try {
    return JSON.parse(localStorage.getItem(IMPORT_JOB_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function persistJobForWorkspace(workspaceId, jobId) {
  if (!workspaceId) return
  const map = loadPersistedJobs()
  if (jobId) map[workspaceId] = jobId
  else delete map[workspaceId]
  localStorage.setItem(IMPORT_JOB_STORAGE_KEY, JSON.stringify(map))
}

function getPersistedJobId(workspaceId) {
  if (!workspaceId) return null
  return loadPersistedJobs()[workspaceId] || null
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
  const activeJobId = ref(null)
  const jobSnapshot = ref(null)

  const currentStage = computed(() =>
    stages.value.find(item => item.status === 'running') || null
  )

  const jobItems = computed(() => jobSnapshot.value?.items || [])
  const completedCount = computed(() => Number(jobSnapshot.value?.completedFiles || 0))
  const failedCount = computed(() => Number(jobSnapshot.value?.failedFiles || 0))
  const totalCount = computed(() => Number(jobSnapshot.value?.totalFiles || 0))
  const activeJobStatus = computed(() => jobSnapshot.value?.status || '')

  const overallProgress = computed(() => {
    if (!totalCount.value) return 0
    let units = completedCount.value + failedCount.value
    for (const item of jobItems.value) {
      if (item.status !== 'running') continue
      const stageTotal = item.stages?.length || 1
      const stageDone = (item.stages || []).filter(stage => stage.status === 'done').length
      units += stageDone / stageTotal
    }
    return Math.min(100, Math.round((units / totalCount.value) * 100))
  })

  const hasActivity = computed(() =>
    Boolean(activeJobId.value || currentFileName.value || parseError.value || processLogs.value.length || jobSnapshot.value)
  )

  function getExt(fileName) {
    return String(fileName || '').split('.').pop().toLowerCase()
  }

  function resetProcess(label = '') {
    currentFileName.value = label
    stages.value = cloneStages()
    processLogs.value = []
    extractionSummary.value = null
    parseError.value = null
    lastResult.value = null
    jobSnapshot.value = null
  }

  function clearProcess() {
    parsing.value = false
    extracting.value = false
    parseError.value = null
    lastResult.value = null
    currentFileName.value = ''
    stages.value = cloneStages()
    processLogs.value = []
    extractionSummary.value = null
    activeJobId.value = null
    jobSnapshot.value = null
    persistJobForWorkspace(graphStore.currentGraphId, null)
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
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
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
        .map(([, texts]) => texts.join(' '))
      pages.push(sorted.join('\n'))
    }
    return pages.join('\n\n')
  }

  async function prepareFilePayload(file) {
    const ext = getExt(file.name)
    let content = ''

    if (ext === 'pdf') {
      content = await extractPdfText(await file.arrayBuffer())
    } else {
      content = await file.text()
    }

    let precomputedGraph = null
    if (ext === 'json') precomputedGraph = parseJSON(content)
    else if (ext === 'csv') precomputedGraph = parseCSV(content)

    return {
      id: generateId('f'),
      fileName: file.name,
      fileType: ext,
      fileSize: file.size,
      content,
      precomputedGraph
    }
  }

  function pickDisplayItem(job) {
    const items = job?.items || []
    return (
      items.find(item => item.status === 'running') ||
      [...items].reverse().find(item => item.status === 'error') ||
      [...items].reverse().find(item => item.status === 'done') ||
      items[0] ||
      null
    )
  }

  function applyJobSnapshot(job) {
    jobSnapshot.value = job
    const item = pickDisplayItem(job)

    currentFileName.value = item?.fileName || ''
    stages.value = item?.stages?.length ? item.stages : cloneStages()
    processLogs.value = item?.logs || []
    extractionSummary.value = item?.summary || null
    parseError.value = item?.error || job?.error || null
    parsing.value = Boolean(item && ['queued', 'running'].includes(item.status))
    extracting.value = Boolean(item?.stages?.find(stage => stage.key === 'extract' && stage.status === 'running'))
  }

  async function refreshWorkspaceGraph() {
    const graphId = graphStore.currentGraphId
    if (!graphId) return
    try {
      await graphStore.loadGraph(graphId)
      await graphStore.refreshGraphList()
    } catch (error) {
      console.warn('[importStore] failed to refresh workspace graph:', error.message)
    }
  }

  async function finalizeJob(jobId, snapshot) {
    if (activeJobId.value === jobId) activeJobId.value = null
    persistJobForWorkspace(graphStore.currentGraphId, null)
    lastResult.value = snapshot
    extracting.value = false
    parsing.value = false
    await refreshWorkspaceGraph()
  }

  async function waitForJob(jobId) {
    let previousCompleted = -1
    let previousFailed = -1

    while (activeJobId.value === jobId) {
      const snapshot = await fetchImportJobApi(jobId)
      applyJobSnapshot(snapshot)

      if (
        snapshot.completedFiles !== previousCompleted ||
        snapshot.failedFiles !== previousFailed
      ) {
        previousCompleted = snapshot.completedFiles
        previousFailed = snapshot.failedFiles
        await refreshWorkspaceGraph()
      }

      if (['completed', 'completed-with-errors', 'failed'].includes(snapshot.status)) {
        await finalizeJob(jobId, snapshot)
        return snapshot
      }

      await sleep(1200)
    }
    return null
  }

  async function restorePersistedJob(workspaceId) {
    if (!workspaceId) {
      clearProcess()
      return
    }

    const persistedJobId = getPersistedJobId(workspaceId)
    if (!persistedJobId) {
      if (!activeJobId.value) {
        currentFileName.value = ''
        stages.value = cloneStages()
        processLogs.value = []
        extractionSummary.value = null
        parseError.value = null
        jobSnapshot.value = null
      }
      return
    }

    try {
      const snapshot = await fetchImportJobApi(persistedJobId)
      applyJobSnapshot(snapshot)

      if (['completed', 'completed-with-errors', 'failed'].includes(snapshot.status)) {
        await finalizeJob(persistedJobId, snapshot)
        return
      }

      activeJobId.value = persistedJobId
      void waitForJob(persistedJobId)
    } catch (error) {
      console.warn('[importStore] failed to restore import job:', error.message)
      persistJobForWorkspace(workspaceId, null)
    }
  }

  async function importFiles(files) {
    if (!graphStore.currentGraphId || !graphStore.currentIntentQuery) {
      throw new Error('请先创建工作区并填写总意图后再导入文件。')
    }

    const selectedFiles = Array.from(files || [])
    if (selectedFiles.length === 0) {
      return { imported: [], errors: [] }
    }

    resetProcess(`准备上传 ${selectedFiles.length} 个文件`)
    parsing.value = true

    const payloadFiles = await Promise.all(selectedFiles.map(file => prepareFilePayload(file)))
    parsing.value = false
    extracting.value = true

    const job = await createImportJobApi(graphStore.currentGraphId, {
      files: payloadFiles,
      options: {
        useLLMExtraction: settings.useLLMExtraction,
        modelName: settings.modelName,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens
      }
    })

    activeJobId.value = job.id
    persistJobForWorkspace(graphStore.currentGraphId, job.id)
    applyJobSnapshot(job)

    const completedJob = await waitForJob(job.id)
    const imported = (completedJob?.items || [])
      .filter(item => item.status === 'done')
      .map(item => ({
        fileName: item.fileName,
        fileType: item.fileType,
        fileSize: item.fileSize,
        summary: item.summary,
        result: item.result
      }))

    const errors = (completedJob?.items || [])
      .filter(item => item.status === 'error')
      .map(item => ({
        fileName: item.fileName,
        message: item.error || '导入失败'
      }))

    return { imported, errors }
  }

  function cancelImport() {
    activeJobId.value = null
    persistJobForWorkspace(graphStore.currentGraphId, null)
  }

  async function retryFailedItems(fileIds = []) {
    const jobId = jobSnapshot.value?.id || lastResult.value?.id || activeJobId.value
    if (!jobId) {
      throw new Error('当前没有可重试的导入任务')
    }

    const job = await retryImportJobApi(jobId, { fileIds })
    activeJobId.value = job.id
    persistJobForWorkspace(graphStore.currentGraphId, job.id)
    applyJobSnapshot(job)
    return waitForJob(job.id)
  }

  watch(
    () => graphStore.currentGraphId,
    graphId => {
      void restorePersistedJob(graphId)
    },
    { immediate: true }
  )

  return {
    parsing,
    extracting,
    parseError,
    lastResult,
    currentFileName,
    currentStage,
    jobItems,
    completedCount,
    failedCount,
    totalCount,
    activeJobStatus,
    overallProgress,
    stages,
    processLogs,
    extractionSummary,
    hasActivity,
    activeJobId,
    jobSnapshot,
    importFiles,
    retryFailedItems,
    cancelImport,
    clearProcess,
    refreshWorkspaceGraph
  }
})
