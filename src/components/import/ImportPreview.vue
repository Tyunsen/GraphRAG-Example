<template>
  <div class="import-preview" v-if="result">
    <div class="preview-header">
      <h4>{{ result.fileName }}</h4>
      <span class="preview-badge">预览</span>
    </div>
    <div class="preview-stats">
      <div class="stat-item">
        <span class="stat-value">{{ result.nodeCount }}</span>
        <span class="stat-label">节点</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ result.edgeCount }}</span>
        <span class="stat-label">关系</span>
      </div>
    </div>

    <div class="preview-list" v-if="result.nodes.length > 0">
      <p class="preview-section-title">节点示例 (前5个)</p>
      <div class="preview-item" v-for="(n, i) in result.nodes.slice(0, 5)" :key="i">
        <span class="preview-dot" :style="{ background: getColor(n.type) }"></span>
        <span>{{ n.label }}</span>
        <span class="preview-type">{{ n.type }}</span>
      </div>
    </div>

    <div class="preview-list" v-if="result.edges.length > 0">
      <p class="preview-section-title">关系示例 (前5个)</p>
      <div class="preview-item" v-for="(e, i) in result.edges.slice(0, 5)" :key="i">
        <span>{{ e.source }} → {{ e.target }}</span>
        <span class="preview-type" v-if="e.label">{{ e.label }}</span>
      </div>
    </div>

    <div class="preview-actions">
      <button class="btn btn-primary" @click="$emit('confirm')">确认导入</button>
      <button class="btn btn-secondary" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup>
import { getColorForType } from '@/utils/colorScale'

defineProps({
  result: { type: Object, default: null }
})

defineEmits(['confirm', 'cancel'])

function getColor(type) {
  return getColorForType(type)
}
</script>

<style scoped>
.import-preview {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 14px;
  margin-top: 12px;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.preview-header h4 {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-warning);
  color: #fff;
}
.preview-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}
.stat-item {
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
}
.stat-label {
  font-size: 11px;
  color: var(--color-text-muted);
}
.preview-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  margin-top: 8px;
}
.preview-list {
  max-height: 120px;
  overflow-y: auto;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
}
.preview-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.preview-type {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-muted);
}
.preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.preview-actions .btn {
  flex: 1;
}
</style>
