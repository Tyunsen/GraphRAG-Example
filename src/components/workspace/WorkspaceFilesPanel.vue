<template>
  <div class="files-panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">文件</div>
        <div class="panel-subtitle">上传、查看和管理当前工作区文件</div>
      </div>
      <button class="refresh-btn" @click="refreshFiles">刷新</button>
    </div>

    <FileImporter
      :disabled="!graphStore.currentGraphId || !graphStore.currentIntentQuery"
      @files-selected="onFilesSelected"
    />

    <div class="file-shell">
      <div class="file-list-panel">
        <div class="file-list-head">
          <div class="file-list-title">文件列表</div>
          <div class="file-list-count">{{ unifiedFiles.length }} 项</div>
        </div>

        <div v-if="filesLoading && unifiedFiles.length === 0" class="file-list-empty">正在加载文件...</div>
        <div v-else-if="unifiedFiles.length === 0" class="file-list-empty">当前工作区还没有文件</div>
        <div v-else class="file-list">
          <button
            v-for="item in unifiedFiles"
            :key="item.rowKey"
            class="file-row"
            :class="[`state-${item.state}`, { active: selectedRowKey === item.rowKey }]"
            @click="selectFileRow(item)"
          >
            <div class="file-row-main">
              <div class="file-row-titleline">
                <span class="file-row-name">{{ item.fileName }}</span>
                <span class="file-row-badge" :class="`badge-${item.state}`">{{ item.stateLabel }}</span>
              </div>

              <div class="file-row-meta">
                <span v-if="item.fileSizeText">{{ item.fileSizeText }}</span>
                <span v-if="item.timeText">{{ item.timeText }}</span>
                <span v-if="item.stageLabel">{{ item.stageLabel }}</span>
              </div>

              <div v-if="item.progress > 0 && item.state !== 'completed'" class="file-row-progress">
                <div class="file-row-progress-track">
                  <div class="file-row-progress-bar" :style="{ width: `${item.progress}%` }"></div>
                </div>
                <span class="file-row-progress-value">{{ item.progress }}%</span>
              </div>

              <div v-if="item.stageDetail" class="file-row-detail">{{ item.stageDetail }}</div>
              <div v-if="item.error" class="file-row-error">{{ item.error }}</div>
            </div>

            <div class="file-row-actions" @click.stop>
              <button
                v-if="item.canRetry"
                class="file-row-action"
                type="button"
                @click="retryItem(item)"
              >
                重试
              </button>
              <button
                v-if="item.fileId"
                class="file-row-action file-row-action-danger"
                type="button"
                @click="removeFile(item)"
              >
                移除
              </button>
            </div>
          </button>
        </div>
      </div>

      <div class="file-detail-panel">
        <template v-if="selectedItem">
          <div class="file-detail-head">
            <div>
              <div class="file-detail-title">{{ selectedItem.fileName }}</div>
              <div class="file-detail-meta">
                <span v-if="selectedItem.fileSizeText">{{ selectedItem.fileSizeText }}</span>
                <span v-if="selectedItem.timeText">{{ selectedItem.timeText }}</span>
                <span>{{ selectedItem.stateLabel }}</span>
              </div>
            </div>

            <div v-if="selectedItem.fileId" class="file-detail-tabs">
              <button
                class="file-detail-tab"
                :class="{ active: detailTab === 'content' }"
                @click="detailTab = 'content'"
              >
                原文
              </button>
              <button
                class="file-detail-tab"
                :class="{ active: detailTab === 'graph' }"
                @click="openFileGraph"
              >
                文件图谱
              </button>
            </div>
          </div>

          <div v-if="selectedItem.fileId && detailLoading" class="file-detail-empty">正在加载文件内容...</div>
          <div v-else-if="selectedItem.fileId && detailError" class="file-detail-empty file-detail-error">{{ detailError }}</div>
          <div v-else-if="selectedItem.fileId && selectedDetail && detailTab === 'content'" class="file-content">
            <div
              v-for="chunk in selectedDetail.chunks || []"
              :key="chunk.id"
              class="file-paragraph"
            >
              <div class="file-paragraph-index">第 {{ chunk.paragraphIndex }} 段</div>
              <div class="file-paragraph-content">{{ chunk.content }}</div>
              <div v-if="chunk.linkedNodes?.length || chunk.linkedEvents?.length" class="file-paragraph-tags">
                <span v-for="label in chunk.linkedNodes || []" :key="`n-${chunk.id}-${label}`" class="tag-chip">
                  {{ label }}
                </span>
                <span v-for="label in chunk.linkedEvents || []" :key="`e-${chunk.id}-${label}`" class="tag-chip tag-chip-event">
                  {{ label }}
                </span>
              </div>
            </div>
          </div>

          <div v-else-if="selectedItem.fileId && selectedDetail && detailTab === 'graph'" class="file-graph-panel">
            <div class="file-graph-summary">
              <div class="file-graph-line">
                <span>关联实体</span>
                <strong>{{ fileLinkedNodes.length }}</strong>
              </div>
              <div class="file-graph-line">
                <span>关联事件</span>
                <strong>{{ fileLinkedEvents.length }}</strong>
              </div>
            </div>

            <div class="file-graph-actions">
              <button class="focus-btn" @click="focusSelectedFileGraph">在右侧查看文件图谱</button>
              <button class="focus-btn focus-btn-secondary" @click="graphStore.showFullGraph()">恢复全图</button>
            </div>

            <div v-if="fileLinkedEvents.length" class="file-tag-block">
              <div class="file-tag-title">事件</div>
              <div class="file-tag-list">
                <span v-for="label in fileLinkedEvents" :key="`event-${label}`" class="tag-chip tag-chip-event">
                  {{ label }}
                </span>
              </div>
            </div>

            <div v-if="fileLinkedNodes.length" class="file-tag-block">
              <div class="file-tag-title">实体</div>
              <div class="file-tag-list">
                <span v-for="label in fileLinkedNodes" :key="`node-${label}`" class="tag-chip">
                  {{ label }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="file-detail-empty">
            <div>{{ selectedItem.stateLabel }}</div>
            <div v-if="selectedItem.stageDetail">{{ selectedItem.stageDetail }}</div>
            <div v-else-if="selectedItem.error">{{ selectedItem.error }}</div>
            <div v-else>这份文件还没有可查看的内容</div>
          </div>
        </template>

        <div v-else class="file-detail-empty">选择一份文件后，在这里查看原文或文件图谱</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { deleteFileApi, fetchFileDetail, fetchFiles } from '@/services/apiClient'
import { useGraphStore } from '@/stores/graphStore'
import { useImportStore } from '@/stores/importStore'
import FileImporter from '@/components/import/FileImporter.vue'

const graphStore = useGraphStore()
const importStore = useImportStore()

const workspaceFiles = ref([])
const filesLoading = ref(false)
const selectedRowKey = ref('')
const selectedDetail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const detailTab = ref('content')

const STAGE_LABELS = {
  receive: '接收',
  parse: '解析',
  extract: '抽取',
  persist: '更新图谱',
  complete: '完成'
}

const unifiedFiles = computed(() => {
  const rows = workspaceFiles.value.map(buildCompletedRow)
  const persistedFileIds = new Set(workspaceFiles.value.map(file => String(file.id || '')).filter(Boolean))
  for (const task of importStore.jobItems || []) {
    const hasPersistedFile = persistedFileIds.has(String(task.id || ''))
    if (task.status === 'done' && hasPersistedFile) continue
    if (task.status === 'skipped' && task?.summary?.method === 'duplicate-skip') continue
    if (task.status === 'skipped' && hasPersistedFile) continue
    rows.push(buildTaskRow(task))
  }
  rows.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))
  return rows
})

const selectedItem = computed(() =>
  unifiedFiles.value.find(item => item.rowKey === selectedRowKey.value) || null
)

const fileLinkedNodes = computed(() => {
  const labels = new Set()
  for (const chunk of selectedDetail.value?.chunks || []) {
    for (const label of chunk.linkedNodes || []) labels.add(label)
  }
  return [...labels]
})

const fileLinkedEvents = computed(() => {
  const labels = new Set()
  for (const chunk of selectedDetail.value?.chunks || []) {
    for (const label of chunk.linkedEvents || []) labels.add(label)
  }
  return [...labels]
})

watch(
  () => graphStore.currentGraphId,
  async () => {
    selectedRowKey.value = ''
    selectedDetail.value = null
    detailError.value = ''
    detailTab.value = 'content'
    await refreshFiles()
    if (!selectedRowKey.value && unifiedFiles.value.length > 0) {
      selectedRowKey.value = unifiedFiles.value[0].rowKey
    }
  },
  { immediate: true }
)

watch(
  () => [importStore.completedCount, importStore.failedCount, importStore.activeJobStatus],
  async () => {
    if (!graphStore.currentGraphId) return
    await refreshFiles()
    if (!selectedRowKey.value && unifiedFiles.value.length > 0) {
      selectedRowKey.value = unifiedFiles.value[0].rowKey
    }
  }
)

watch(
  () => selectedRowKey.value,
  async () => {
    detailTab.value = 'content'
    await loadSelectedDetail()
  }
)

async function onFilesSelected(files) {
  const selectedFiles = Array.from(files || [])
  if (selectedFiles.length === 0) return

  await importStore.importFiles(selectedFiles)
  await refreshFiles()
  await graphStore.refreshGraphList()
}

async function refreshFiles() {
  if (!graphStore.currentGraphId) {
    workspaceFiles.value = []
    return
  }

  filesLoading.value = true
  try {
    workspaceFiles.value = await fetchFiles(graphStore.currentGraphId)
  } catch (error) {
    console.warn('[WorkspaceFilesPanel] failed to load files:', error.message)
    workspaceFiles.value = []
  } finally {
    filesLoading.value = false
  }
}

async function selectFileRow(item) {
  selectedRowKey.value = item.rowKey
}

async function loadSelectedDetail() {
  const item = selectedItem.value
  selectedDetail.value = null
  detailError.value = ''

  if (!item?.fileId) return

  detailLoading.value = true
  try {
    selectedDetail.value = await fetchFileDetail(item.fileId)
  } catch (error) {
    detailError.value = error.message || '加载文件详情失败'
  } finally {
    detailLoading.value = false
  }
}

function openFileGraph() {
  detailTab.value = 'graph'
  focusSelectedFileGraph()
}

function focusSelectedFileGraph() {
  if (!selectedDetail.value) return
  graphStore.focusEvidenceItem({
    linkedNodes: fileLinkedNodes.value,
    linkedEvents: fileLinkedEvents.value
  }, { maxDepth: 1, maxNodes: 36 })
}

async function removeFile(item) {
  if (!graphStore.currentGraphId || !item.fileId) return
  await deleteFileApi(graphStore.currentGraphId, item.fileId)
  if (selectedRowKey.value === item.rowKey) {
    selectedRowKey.value = ''
    selectedDetail.value = null
  }
  await graphStore.loadGraph(graphStore.currentGraphId)
  await refreshFiles()
  await graphStore.refreshGraphList()
}

async function retryItem(item) {
  if (!item?.taskId) return
  await importStore.retryFailedItems([item.taskId])
  await refreshFiles()
}

function buildCompletedRow(file) {
  const storedState = formatStoredFileState(file)
  return {
    rowKey: `file:${file.id}`,
    fileId: file.id,
    taskId: '',
    fileName: file.fileName,
    fileSizeText: formatFileSize(file.fileSize),
    timeText: formatTime(file.importedAt),
    timestamp: Number(file.importedAt || 0),
    progress: 100,
    state: storedState.state,
    stateLabel: storedState.label,
    stageLabel: '',
    stageDetail: file.importMessage || '',
    error: '',
    canRetry: false
  }
}

function buildTaskRow(task) {
  const stage = getCurrentTaskStage(task)
  const state = task.status === 'error'
    ? 'error'
    : task.status === 'skipped'
      ? 'skipped'
      : task.status === 'done'
        ? 'completed'
        : 'running'

  return {
    rowKey: `task:${task.id}`,
    fileId: '',
    taskId: task.id,
    fileName: task.fileName,
    fileSizeText: formatFileSize(task.fileSize),
    timeText: '',
    timestamp: Number(task.updatedAt || task.createdAt || Date.now()),
    progress: task.status === 'skipped' ? 100 : getTaskProgress(task),
    state,
    stateLabel: formatTaskState(task),
    stageLabel: stage ? formatStageLabel(stage.key) : '',
    stageDetail: stage?.detail || '',
    error: task.error || '',
    canRetry: task.status === 'error'
  }
}

function getTaskProgress(item) {
  const stages = item?.stages || []
  if (!stages.length) return 0
  let progress = 0
  stages.forEach((stage, index) => {
    if (stage.status === 'done') progress += 1
    else if (stage.status === 'running') progress += 0.55
    else if (stage.status === 'error') progress = Math.max(progress, index + 0.35)
  })
  return Math.min(100, Math.round((progress / stages.length) * 100))
}

function getCurrentTaskStage(item) {
  return (
    item?.stages?.find(stage => stage.status === 'running') ||
    [...(item?.stages || [])].reverse().find(stage => stage.status === 'done') ||
    null
  )
}

function formatTaskState(item) {
  if (item.status === 'done') return '已完成'
  if (item.status === 'skipped') {
    if (item?.summary?.method === 'duplicate-skip') return '重复跳过'
    if (item?.result?.skipReason === 'no-match' || item?.summary?.nodeCount === 0) return '未命中'
    return '已跳过'
  }
  if (item.status === 'error') return '失败'
  if (item.status === 'queued') return '排队中'
  return '处理中'
}

function formatStoredFileState(file) {
  const status = String(file.importStatus || 'completed').trim()
  if (status === 'no-match') {
    return {
      state: 'skipped',
      label: '未命中'
    }
  }

  return {
    state: 'completed',
    label: '已完成'
  }
}

function formatStageLabel(stageKey) {
  return STAGE_LABELS[stageKey] || stageKey
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${time}`
}

function formatFileSize(size) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.files-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 14px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
}

.panel-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.refresh-btn {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}

.file-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(0, 1.35fr);
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.file-list-panel,
.file-detail-panel {
  min-height: 0;
  background: transparent;
}

.file-list-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgba(148, 163, 184, 0.14);
}

.file-list-head,
.file-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.file-list-title,
.file-detail-title {
  font-size: 14px;
  font-weight: 700;
}

.file-list-count,
.file-detail-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

.file-list-empty,
.file-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 18px;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

.file-detail-error {
  color: var(--color-danger);
}

.file-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-row {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.84);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.file-row:hover {
  border-color: rgba(79, 109, 245, 0.24);
  background: rgba(255, 255, 255, 0.98);
}

.file-row.active {
  border-color: rgba(79, 109, 245, 0.36);
  background: rgba(79, 109, 245, 0.08);
}

.file-row.state-error {
  border-color: rgba(220, 38, 38, 0.22);
}

.file-row.state-skipped {
  border-color: rgba(245, 158, 11, 0.22);
}

.file-row-main {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 6px;
}

.file-row-titleline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-row-name {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-row-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.badge-completed {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.badge-running {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.badge-error {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.badge-skipped {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.file-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.file-row-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.file-row-progress-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

.file-row-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
}

.file-row-progress-value,
.file-row-detail {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.file-row-error {
  font-size: 11px;
  color: var(--color-danger);
}

.file-row-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.file-row-action {
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.92);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-row-action-danger {
  color: var(--color-danger);
}

.file-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-detail-tabs {
  display: flex;
  gap: 8px;
}

.file-detail-tab {
  padding: 7px 12px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.9);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-detail-tab.active {
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
}

.file-content,
.file-graph-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-paragraph {
  padding: 12px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.12);
  display: grid;
  gap: 8px;
}

.file-paragraph-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.file-paragraph-content {
  font-size: 13px;
  line-height: 1.72;
  white-space: pre-wrap;
}

.file-paragraph-tags,
.file-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(79, 109, 245, 0.08);
  color: var(--color-primary);
  font-size: 11px;
}

.tag-chip-event {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.file-graph-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.file-graph-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.file-graph-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.focus-btn {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}

.focus-btn-secondary {
  background: rgba(241, 245, 249, 0.92);
  color: var(--color-text-secondary);
}

.file-tag-block {
  display: grid;
  gap: 10px;
}

.file-tag-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

@media (max-width: 1100px) {
  .file-shell {
    grid-template-columns: 1fr;
  }

  .file-list-panel {
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  }
}
</style>
