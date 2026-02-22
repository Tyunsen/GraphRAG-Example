<template>
  <div class="import-history" v-if="graphStore.importHistory.length > 0">
    <div class="history-header">
      <h4>导入历史</h4>
      <button class="btn btn-sm btn-danger" @click="graphStore.clearGraph()">清空全部</button>
    </div>
    <div class="history-list">
      <div class="history-item" v-for="item in reversedHistory" :key="item.id">
        <div class="history-info">
          <span class="history-name">{{ item.fileName }}</span>
          <span class="history-meta">
            {{ item.nodesAdded }} 节点, {{ item.edgesAdded }} 关系
          </span>
          <span class="history-time">{{ formatTime(item.timestamp) }}</span>
        </div>
        <button class="btn btn-sm btn-secondary" @click="graphStore.removeImport(item.id)">删除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()

const reversedHistory = computed(() => [...graphStore.importHistory].reverse())

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.import-history {
  margin-top: 16px;
}
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.history-header h4 {
  font-size: 13px;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
}
.history-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.history-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-meta {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.history-time {
  font-size: 10px;
  color: var(--color-text-muted);
}
</style>
