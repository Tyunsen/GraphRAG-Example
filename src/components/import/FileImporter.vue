<template>
  <div
    class="file-importer"
    :class="{ dragging: isDragging, disabled }"
    @dragover.prevent="onDragOver"
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
      <p class="file-importer-text">{{ disabled ? '请先创建工作区并填写总意图' : '拖拽文件到此处或点击上传' }}</p>
      <p class="file-importer-hint">支持 JSON / CSV / TXT / MD / PDF 格式</p>
      <p class="file-importer-desc">系统会基于工作区意图抽取实体、事件和关系，不再默认做全量抽取。</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['files-selected'])

const isDragging = ref(false)
const fileInput = ref(null)

function openFileDialog() {
  if (props.disabled) return
  fileInput.value?.click()
}

function onDragOver() {
  if (props.disabled) return
  isDragging.value = true
}

function onDrop(event) {
  isDragging.value = false
  if (props.disabled) return
  const files = Array.from(event.dataTransfer.files).filter(file =>
    /\.(json|csv|txt|md|markdown|pdf)$/i.test(file.name)
  )
  if (files.length > 0) emit('files-selected', files)
}

function onFileSelect(event) {
  if (props.disabled) return
  const files = Array.from(event.target.files)
  if (files.length > 0) emit('files-selected', files)
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
.file-importer.disabled {
  cursor: not-allowed;
  opacity: 0.72;
}
.file-importer.disabled:hover {
  border-color: var(--color-border);
  background: var(--color-bg);
}
.file-importer-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.file-importer-text {
  font-weight: 500;
  margin-bottom: 4px;
}
.file-importer-hint,
.file-importer-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}
.file-importer-desc {
  margin-top: 4px;
  line-height: 1.5;
}
</style>
