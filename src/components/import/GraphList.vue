<template>
  <div class="graph-list">
    <div class="graph-list-header">
      <h4>图谱列表</h4>
      <button class="btn btn-sm btn-primary" @click="createNew">新建</button>
    </div>

    <div v-if="graphStore.savedGraphs.length === 0" class="graph-list-empty">
      <p>暂无保存的图谱</p>
      <p class="text-muted">导入文件后将自动保存</p>
    </div>

    <div class="graph-list-items" v-else>
      <div
        class="graph-item"
        :class="{ active: graphStore.currentGraphId === g.id }"
        v-for="g in sortedGraphs"
        :key="g.id"
      >
        <div class="graph-item-main" @click="loadGraph(g.id)">
          <!-- Inline rename -->
          <div v-if="renamingId === g.id" class="rename-row" @click.stop>
            <input
              ref="renameInputRef"
              class="input rename-input"
              v-model="renameValue"
              @keydown.enter="confirmRename"
              @keydown.escape="cancelRename"
              @blur="confirmRename"
            />
          </div>
          <div v-else class="graph-item-info">
            <span class="graph-item-name">{{ g.name }}</span>
            <span class="graph-item-meta">
              {{ g.nodeCount }} 节点 · {{ g.edgeCount }} 关系
            </span>
            <span class="graph-item-time">{{ formatTime(g.updatedAt || g.createdAt) }}</span>
          </div>
          <div v-if="graphStore.currentGraphId === g.id" class="graph-item-active-badge">当前</div>
        </div>
        <div class="graph-item-actions">
          <button class="action-btn" title="重命名" @click.stop="startRename(g)">✎</button>
          <button class="action-btn action-btn-danger" title="删除" @click.stop="deleteGraph(g.id)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()

const renamingId = ref(null)
const renameValue = ref('')
const renameInputRef = ref(null)

const sortedGraphs = computed(() =>
  [...graphStore.savedGraphs].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
)

async function loadGraph(graphId) {
  if (graphStore.currentGraphId === graphId) return
  try {
    await graphStore.loadGraph(graphId)
  } catch (e) {
    console.error('[GraphList] Failed to load graph:', e)
  }
}

function createNew() {
  graphStore.createNewGraph()
}

function deleteGraph(graphId) {
  graphStore.deleteSavedGraph(graphId)
}

function startRename(g) {
  renamingId.value = g.id
  renameValue.value = g.name
  nextTick(() => {
    const inputs = renameInputRef.value
    const el = Array.isArray(inputs) ? inputs[0] : inputs
    el?.focus()
    el?.select()
  })
}

function confirmRename() {
  if (renamingId.value && renameValue.value.trim()) {
    graphStore.renameGraph(renamingId.value, renameValue.value.trim())
  }
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (isToday) return time
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${time}`
}
</script>

<style scoped>
.graph-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.graph-list-header h4 {
  font-size: 13px;
}
.graph-list-empty {
  text-align: center;
  padding: 24px 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.graph-list-empty .text-muted {
  font-size: 12px;
  margin-top: 4px;
}
.graph-list-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.graph-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.graph-item:hover {
  background: var(--color-bg-hover);
}
.graph-item.active {
  border-color: var(--color-primary);
  background: rgba(79, 109, 245, 0.04);
}
.graph-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.graph-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.graph-item-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-item-meta {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.graph-item-time {
  font-size: 10px;
  color: var(--color-text-muted);
}
.graph-item-active-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  flex-shrink: 0;
}
.graph-item-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 4px;
}
.action-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-text-muted);
  font-size: 13px;
  transition: all 0.15s;
}
.action-btn:hover {
  background: var(--color-bg-input);
  color: var(--color-text);
}
.action-btn-danger:hover {
  background: #fef2f2;
  color: var(--color-danger);
}
.rename-row {
  flex: 1;
  min-width: 0;
}
.rename-input {
  padding: 3px 8px;
  font-size: 13px;
  font-weight: 600;
}
</style>
