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
      <div class="file-importer-title">{{ disabled ? '先补工作区意图' : '上传文件' }}</div>
      <div class="file-importer-desc">
        {{ disabled ? '没有总意图时，系统不会开始抽取。' : '拖拽到这里，或点击选择文件。' }}
      </div>
      <div class="file-importer-meta">支持 JSON / CSV / TXT / MD / PDF</div>
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
  border: 1px dashed rgba(79, 109, 245, 0.28);
  border-radius: 16px;
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(79, 109, 245, 0.04);
}

.file-importer:hover,
.file-importer.dragging {
  border-color: var(--color-primary);
  background: rgba(79, 109, 245, 0.08);
}

.file-importer.disabled {
  cursor: not-allowed;
  opacity: 0.72;
  border-color: var(--color-border);
  background: rgba(241, 245, 249, 0.8);
}

.file-importer-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-importer-title {
  font-size: 13px;
  font-weight: 700;
}

.file-importer-desc,
.file-importer-meta {
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

.file-importer-meta {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
