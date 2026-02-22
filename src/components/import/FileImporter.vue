<template>
  <div
    class="file-importer"
    :class="{ dragging: isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="onDrop"
    @click="openFileDialog"
  >
    <input
      ref="fileInput"
      type="file"
      multiple
      accept=".json,.csv,.txt,.md,.markdown,.pdf"
      @change="onFileSelect"
      style="display: none"
    />
    <div class="file-importer-content">
      <div class="file-importer-icon">📁</div>
      <p class="file-importer-text">拖拽文件到此处或点击上传</p>
      <p class="file-importer-hint">支持 JSON / CSV / TXT / MD / PDF 格式</p>
      <p class="file-importer-desc">结构化数据直接导入，普通文档自动提取实体关系</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['files-selected'])

const isDragging = ref(false)
const fileInput = ref(null)

function openFileDialog() {
  fileInput.value?.click()
}

function onDrop(event) {
  isDragging.value = false
  const files = Array.from(event.dataTransfer.files).filter(f =>
    /\.(json|csv|txt|md|markdown|pdf)$/i.test(f.name)
  )
  if (files.length > 0) {
    emit('files-selected', files)
  }
}

function onFileSelect(event) {
  const files = Array.from(event.target.files)
  if (files.length > 0) {
    emit('files-selected', files)
  }
  event.target.value = ''
}
</script>

<style scoped>
.file-importer {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-bg);
}
.file-importer:hover,
.file-importer.dragging {
  border-color: var(--color-primary);
  background: rgba(79, 109, 245, 0.04);
}
.file-importer-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.file-importer-text {
  font-weight: 500;
  margin-bottom: 4px;
}
.file-importer-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}
.file-importer-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
</style>
