<template>
  <div class="files-panel">
    <div class="panel-header">
      <div class="panel-title">文件</div>
      <button class="refresh-btn" @click="refreshFiles">刷新</button>
    </div>

    <FileImporter
      :disabled="!graphStore.currentGraphId || !graphStore.currentIntentQuery"
      @files-selected="onFilesSelected"
    />

    <div v-if="importStore.hasActivity" class="process-card">
      <div class="process-head">
        <div>
          <div class="process-title">导入任务</div>
          <div class="process-file">{{ importSummary }}</div>
        </div>
        <button class="process-clear" @click="importStore.clearProcess()">清除</button>
      </div>

      <div class="progress-copy">
        <div class="progress-label">{{ progressLabel }}</div>
        <div class="progress-value">{{ progressPercent }}%</div>
      </div>

      <div class="progress-track">
        <div class="progress-bar" :class="{ error: Boolean(importStore.parseError) }" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <div v-if="activeStageDetail" class="progress-detail">{{ activeStageDetail }}</div>

      <div v-if="taskItems.length" class="task-list">
        <div
          v-for="item in taskItems"
          :key="item.id"
          class="task-item"
          :class="`task-${item.status}`"
        >
          <div class="task-item-head">
            <div class="task-item-name">{{ item.fileName }}</div>
            <div class="task-item-state">{{ formatTaskState(item) }}</div>
          </div>
          <div class="task-item-track">
            <div class="task-item-bar" :style="{ width: `${getTaskProgress(item)}%` }"></div>
          </div>
          <div v-if="item.stages?.length" class="task-item-stages">
            <span
              v-for="stage in item.stages"
              :key="`${item.id}-${stage.key}`"
              class="task-stage-dot"
              :class="`task-stage-${stage.status}`"
            ></span>
          </div>
          <div v-if="item.summary" class="task-item-meta">
            {{ item.summary.method }} · {{ item.summary.nodeCount }} 节点 · {{ item.summary.edgeCount }} 关系
          </div>
          <div v-else-if="item.error" class="task-item-error">{{ item.error }}</div>
        </div>
      </div>

      <div v-if="importStore.extractionSummary" class="summary-card">
        <div class="summary-line">
          <span>当前文件</span>
          <strong>{{ importStore.currentFileName || '未开始' }}</strong>
        </div>
        <div class="summary-line">
          <span>方式</span>
          <strong>{{ importStore.extractionSummary.method }}</strong>
        </div>
        <div class="summary-line">
          <span>结果</span>
          <strong>{{ importStore.extractionSummary.nodeCount }} 节点 · {{ importStore.extractionSummary.edgeCount }} 关系</strong>
        </div>
        <div v-if="importStore.extractionSummary.entityLabels.length" class="summary-tags">
          <span v-for="label in importStore.extractionSummary.entityLabels" :key="label" class="summary-tag">{{ label }}</span>
        </div>
        <div v-if="importStore.extractionSummary.eventLabels.length" class="summary-tags">
          <span v-for="label in importStore.extractionSummary.eventLabels" :key="label" class="summary-tag summary-tag-event">{{ label }}</span>
        </div>
      </div>

      <details v-if="importStore.processLogs.length" class="process-details">
        <summary>查看当前文件日志</summary>
        <div class="log-list">
          <div v-for="line in importStore.processLogs" :key="line" class="log-line">{{ line }}</div>
        </div>
      </details>
    </div>

    <div v-if="importStore.parseError" class="status-card status-error">{{ importStore.parseError }}</div>

    <div class="file-list-card">
      <div class="file-list-title">已上传文件</div>
      <div v-if="filesLoading" class="file-list-empty">正在加载文件...</div>
      <div v-else-if="workspaceFiles.length === 0" class="file-list-empty">这个工作区还没有文件。</div>
      <div v-else class="file-list">
        <div v-for="file in workspaceFiles" :key="file.id" class="file-row">
          <div class="file-row-main">
            <div class="file-row-name">{{ file.fileName }}</div>
            <div class="file-row-meta">
              {{ formatFileSize(file.fileSize) }} · {{ formatTime(file.importedAt) }}
            </div>
          </div>
          <button class="file-row-delete" @click="removeFile(file)">移除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { deleteFileApi, fetchFiles } from '@/services/apiClient'
import { useGraphStore } from '@/stores/graphStore'
import { useImportStore } from '@/stores/importStore'
import FileImporter from '@/components/import/FileImporter.vue'

const graphStore = useGraphStore()
const importStore = useImportStore()
const workspaceFiles = ref([])
const filesLoading = ref(false)

const taskItems = computed(() => importStore.jobItems || [])

const progressPercent = computed(() => {
  if (importStore.totalCount) return importStore.overallProgress

  const stages = importStore.stages
  if (!stages.length) return 0

  const total = stages.length
  let progress = 0
  stages.forEach((stage, index) => {
    if (stage.status === 'done') progress += 1
    else if (stage.status === 'running') progress += 0.55
    else if (stage.status === 'ready') progress += 0.82
    else if (stage.status === 'error') progress = Math.max(progress, index + 0.35)
  })
  return Math.min(100, Math.max(0, Math.round((progress / total) * 100)))
})

const progressLabel = computed(() => {
  if (importStore.parseError) return '处理失败'
  if (importStore.totalCount) {
    if (importStore.completedCount + importStore.failedCount === importStore.totalCount) {
      return importStore.failedCount > 0
        ? `完成 ${importStore.completedCount}/${importStore.totalCount}，失败 ${importStore.failedCount}`
        : `已完成 ${importStore.totalCount} 个文件`
    }
    return `已完成 ${importStore.completedCount}/${importStore.totalCount}`
  }

  const running = importStore.currentStage
  if (running) return `正在${running.label}`
  return '等待处理'
})

const activeStageDetail = computed(() => {
  const running = importStore.currentStage
  if (running?.detail) return running.detail
  const lastDone = [...importStore.stages].reverse().find(item => item.status === 'done' && item.detail)
  return lastDone?.detail || ''
})

const importSummary = computed(() => {
  if (importStore.totalCount) {
    return `本轮共 ${importStore.totalCount} 个文件`
  }
  return importStore.currentFileName || '等待文件'
})

watch(() => graphStore.currentGraphId, refreshFiles, { immediate: true })

async function onFilesSelected(files) {
  const selectedFiles = Array.from(files || [])
  if (selectedFiles.length === 0) return

  await importStore.importFiles(selectedFiles)
  if (!graphStore.currentGraphId) return
  await graphStore.loadGraph(graphStore.currentGraphId)
  await refreshFiles()
  graphStore.syncCurrentGraphMeta({
    fileCount: workspaceFiles.value.length,
    nodeCount: graphStore.nodeCount,
    edgeCount: graphStore.edgeCount,
    updatedAt: Date.now()
  })
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

async function removeFile(file) {
  if (!graphStore.currentGraphId) return
  await deleteFileApi(graphStore.currentGraphId, file.id)
  await graphStore.loadGraph(graphStore.currentGraphId)
  await refreshFiles()
  graphStore.syncCurrentGraphMeta({
    fileCount: workspaceFiles.value.length,
    nodeCount: graphStore.nodeCount,
    edgeCount: graphStore.edgeCount,
    updatedAt: Date.now()
  })
  await graphStore.refreshGraphList()
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

function formatTaskState(item) {
  if (item.status === 'done') return '完成'
  if (item.status === 'error') return '失败'
  if (item.status === 'running') return `${getTaskProgress(item)}%`
  return '排队中'
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
}

.refresh-btn {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}

.process-card,
.file-list-card,
.summary-card {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.file-list-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.process-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.process-title,
.file-list-title {
  font-size: 13px;
  font-weight: 700;
}

.process-file {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.process-clear {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.96);
  color: var(--color-text-secondary);
  font-size: 11px;
}

.progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}

.progress-label {
  font-size: 12px;
  font-weight: 600;
}

.progress-value {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.progress-track {
  margin-top: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4f6df5, #2f9ef5);
  transition: width 0.24s ease;
}

.progress-bar.error {
  background: linear-gradient(90deg, #ef4444, #f97316);
}

.progress-detail {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.task-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.task-item {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid var(--color-border-light);
}

.task-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-item-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-state,
.task-item-meta,
.task-item-error {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.task-item-error {
  color: var(--color-danger);
}

.task-item-track {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
  overflow: hidden;
}

.task-item-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4f6df5, #2f9ef5);
}

.task-done .task-item-bar {
  background: linear-gradient(90deg, #16a34a, #22c55e);
}

.task-error .task-item-bar {
  background: linear-gradient(90deg, #ef4444, #f97316);
}

.task-item-stages {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.task-stage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.5);
}

.task-stage-running {
  background: var(--color-primary);
}

.task-stage-done,
.task-stage-ready {
  background: #16a34a;
}

.task-stage-error {
  background: var(--color-danger);
}

.task-item-meta,
.task-item-error {
  margin-top: 8px;
}

.summary-card {
  margin-top: 14px;
}

.summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  margin-bottom: 8px;
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.summary-tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(79, 109, 245, 0.08);
  color: var(--color-primary);
  font-size: 11px;
}

.summary-tag-event {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.process-details {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border-light);
}

.process-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.log-list {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

.log-line {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.status-card {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.88);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.status-error {
  color: var(--color-danger);
  background: rgba(254, 242, 242, 0.9);
  border-color: rgba(252, 165, 165, 0.7);
}

.file-list-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border-light);
}

.file-row:first-child {
  border-top: none;
  padding-top: 0;
}

.file-row-main {
  min-width: 0;
}

.file-row-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.file-row-delete {
  flex-shrink: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(254, 242, 242, 0.92);
  color: var(--color-danger);
  font-size: 11px;
}
</style>
