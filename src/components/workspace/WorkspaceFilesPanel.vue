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
          <div class="process-title">导入进度</div>
          <div class="process-file">{{ importStore.currentFileName || '等待文件' }}</div>
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

      <div class="stage-pills">
        <div
          v-for="stage in importStore.stages"
          :key="stage.key"
          class="stage-pill"
          :class="`stage-${stage.status}`"
        >
          <span class="stage-pill-dot"></span>
          <span>{{ stage.label }}</span>
        </div>
      </div>

      <div v-if="activeStageDetail" class="progress-detail">{{ activeStageDetail }}</div>

      <div v-if="importStore.extractionSummary" class="summary-card">
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
        <summary>查看详细过程</summary>
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

const progressPercent = computed(() => {
  const stages = importStore.stages
  if (!stages.length) return 0

  const total = stages.length
  let progress = 0

  stages.forEach((stage, index) => {
    if (stage.status === 'done') {
      progress += 1
      return
    }
    if (stage.status === 'running') {
      progress += 0.55
      return
    }
    if (stage.status === 'ready') {
      progress += 0.82
      return
    }
    if (stage.status === 'error') {
      progress = Math.max(progress, index + 0.35)
    }
  })

  return Math.min(100, Math.max(0, Math.round((progress / total) * 100)))
})

const progressLabel = computed(() => {
  if (importStore.parseError) return '处理失败'
  const running = importStore.currentStage
  if (running) return `正在${running.label}`
  const ready = importStore.stages.find(item => item.status === 'ready')
  if (ready) return '等待确认导入'
  const done = importStore.stages.every(item => item.status === 'done' || item.status === 'idle')
  if (done && importStore.processLogs.length) return '导入完成'
  return '等待处理'
})

const activeStageDetail = computed(() => {
  const running = importStore.currentStage
  if (running?.detail) return running.detail
  const ready = importStore.stages.find(item => item.status === 'ready' && item.detail)
  if (ready) return ready.detail
  const lastDone = [...importStore.stages].reverse().find(item => item.status === 'done' && item.detail)
  return lastDone?.detail || ''
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

.stage-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.stage-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  color: var(--color-text-secondary);
  font-size: 11px;
}

.stage-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.6);
}

.stage-running {
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
}

.stage-running .stage-pill-dot {
  background: var(--color-primary);
}

.stage-done,
.stage-ready {
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.stage-done .stage-pill-dot,
.stage-ready .stage-pill-dot {
  background: #16a34a;
}

.stage-error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

.stage-error .stage-pill-dot {
  background: var(--color-danger);
}

.progress-detail {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.7;
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
