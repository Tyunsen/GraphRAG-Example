<template>
  <div class="files-panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">文件管理</div>
        <div class="panel-subtitle">文件属于当前工作区，会参与图谱构建和问答证据检索。</div>
      </div>
      <button class="refresh-btn" @click="refreshFiles">刷新</button>
    </div>

    <FileImporter
      :disabled="!graphStore.currentGraphId || !graphStore.currentIntentQuery"
      @files-selected="onFilesSelected"
    />

    <div v-if="extracting" class="status-card status-info">
      <span class="status-spinner"></span>
      <span>AI 正在按工作区意图抽取实体、事件和关系。</span>
    </div>
    <div v-else-if="parsing" class="status-card">正在解析文件内容...</div>
    <div v-if="parseError" class="status-card status-error">{{ parseError }}</div>

    <ImportPreview :result="lastResult" @confirm="confirmAndRefresh" @cancel="cancelImport" />

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
          <button class="file-row-delete" @click="removeFile(file.id)">移除</button>
        </div>
      </div>
    </div>

    <ImportHistory />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { deleteFileApi, fetchFiles } from '@/services/apiClient'
import { useFileParser } from '@/composables/useFileParser'
import { useGraphStore } from '@/stores/graphStore'
import FileImporter from '@/components/import/FileImporter.vue'
import ImportPreview from '@/components/import/ImportPreview.vue'
import ImportHistory from '@/components/import/ImportHistory.vue'

const graphStore = useGraphStore()
const workspaceFiles = ref([])
const filesLoading = ref(false)
const { parsing, extracting, parseError, lastResult, parseFile, confirmImport, cancelImport } = useFileParser()

watch(() => graphStore.currentGraphId, refreshFiles, { immediate: true })

async function onFilesSelected(files) {
  for (const file of files) {
    try {
      await parseFile(file)
    } catch {
      // parseError already captures the user-visible message.
    }
  }
}

async function confirmAndRefresh() {
  await confirmImport()
  await refreshFiles()
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

async function removeFile(fileId) {
  await deleteFileApi(fileId)
  await refreshFiles()
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
  gap: 14px;
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.panel-title {
  font-size: 16px;
  font-weight: 700;
}
.panel-subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
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
.status-card {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.88);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
}
.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
}
.status-error {
  color: var(--color-danger);
  background: rgba(254, 242, 242, 0.9);
  border-color: rgba(252, 165, 165, 0.7);
}
.status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(79, 109, 245, 0.18);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.file-list-card {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.file-list-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}
.file-list-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
