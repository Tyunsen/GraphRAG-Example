<template>
  <div class="graph-list">
    <div v-if="creating" class="workspace-form">
      <div class="workspace-form-title">新建工作区</div>
      <input class="input" v-model="createName" placeholder="工作区名称，例如：伊朗局势跟踪" />
      <textarea
        class="input workspace-intent"
        v-model="createIntent"
        placeholder="输入这个工作区的总意图，例如：围绕伊朗战争，提取军事打击、核设施、油价、航运风险与外交信号相关的实体、事件与事件链。"
      />
      <div class="inline-actions">
        <button class="btn btn-primary" @click="submitCreate">创建</button>
        <button class="btn btn-secondary" @click="toggleCreate(false)">取消</button>
      </div>
    </div>

    <div v-if="graphStore.savedGraphs.length === 0" class="graph-list-empty">
      <p>还没有工作区</p>
      <button class="empty-create-btn" @click="toggleCreate(true)">创建第一个工作区</button>
    </div>

    <div v-else class="graph-list-items">
      <button
        v-for="workspace in sortedGraphs"
        :key="workspace.id"
        class="graph-item"
        :class="{ active: graphStore.currentGraphId === workspace.id }"
        @click="loadGraph(workspace.id)"
      >
        <div class="graph-item-main">
          <div class="graph-item-topline">
            <span class="graph-item-name">{{ workspace.name }}</span>
            <span v-if="graphStore.currentGraphId === workspace.id" class="graph-item-badge">当前</span>
          </div>
          <div class="graph-item-meta">
            {{ workspace.fileCount || 0 }} 文档 · {{ workspace.sessionCount || 0 }} 会话 · {{ workspace.nodeCount || 0 }} 节点
          </div>
          <div class="graph-item-time">{{ formatTime(workspace.updatedAt || workspace.createdAt) }}</div>
        </div>

        <div class="graph-item-actions" @click.stop>
          <button class="action-btn" title="编辑工作区" @click="startEdit(workspace)">编辑</button>
          <button class="action-btn action-btn-danger" title="删除工作区" @click="deleteGraph(workspace.id)">删除</button>
        </div>
      </button>
    </div>

    <div v-if="editingId" class="workspace-form workspace-form-edit">
      <div class="workspace-form-title">编辑工作区</div>
      <input class="input" v-model="editName" placeholder="工作区名称" />
      <textarea class="input workspace-intent" v-model="editIntent" placeholder="更新这个工作区的总意图" />
      <div class="inline-actions">
        <button class="btn btn-primary" @click="confirmEdit">保存</button>
        <button class="btn btn-secondary" @click="cancelEdit">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()

const creating = ref(false)
const createName = ref('')
const createIntent = ref('')

const editingId = ref(null)
const editName = ref('')
const editIntent = ref('')

const sortedGraphs = computed(() =>
  [...graphStore.savedGraphs].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
)

async function loadGraph(graphId) {
  if (editingId.value || graphStore.currentGraphId === graphId) return
  await graphStore.loadGraph(graphId)
}

function toggleCreate(force) {
  creating.value = typeof force === 'boolean' ? force : !creating.value
  if (!creating.value) {
    createName.value = ''
    createIntent.value = ''
  }
}

function openCreatePanel() {
  toggleCreate(true)
}

async function submitCreate() {
  if (!createIntent.value.trim()) return
  await graphStore.createWorkspace({
    name: createName.value.trim() || '未命名工作区',
    intentQuery: createIntent.value.trim()
  })
  createName.value = ''
  createIntent.value = ''
  creating.value = false
}

async function deleteGraph(graphId) {
  await graphStore.deleteSavedGraph(graphId)
  if (editingId.value === graphId) cancelEdit()
}

function startEdit(workspace) {
  editingId.value = workspace.id
  editName.value = workspace.name
  editIntent.value = workspace.intentQuery || ''
}

async function confirmEdit() {
  if (!editingId.value || !editIntent.value.trim()) return
  await graphStore.renameGraph(editingId.value, {
    name: editName.value.trim() || '未命名工作区',
    intentQuery: editIntent.value.trim()
  })
  cancelEdit()
}

function cancelEdit() {
  editingId.value = null
  editName.value = ''
  editIntent.value = ''
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${time}`
}

defineExpose({ openCreatePanel })
</script>

<style scoped>
.graph-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-form {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.workspace-form-title {
  font-size: 13px;
  font-weight: 700;
}

.workspace-form-edit {
  margin-top: 4px;
}

.workspace-intent {
  min-height: 108px;
  resize: none;
}

.inline-actions {
  display: flex;
  gap: 8px;
}

.graph-list-empty {
  text-align: center;
  padding: 24px 12px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.72);
  border: 1px dashed rgba(148, 163, 184, 0.4);
  color: var(--color-text-muted);
  font-size: 13px;
  display: grid;
  gap: 12px;
}

.empty-create-btn {
  justify-self: center;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.graph-list-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.graph-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid transparent;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.graph-item:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(148, 163, 184, 0.24);
  transform: translateY(-1px);
}

.graph-item.active {
  border-color: rgba(79, 109, 245, 0.28);
  background: rgba(79, 109, 245, 0.08);
}

.graph-item-main {
  min-width: 0;
  flex: 1;
}

.graph-item-topline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.graph-item-name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-item-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
}

.graph-item-meta,
.graph-item-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.graph-item-meta {
  margin-top: 4px;
}

.graph-item-time {
  margin-top: 6px;
}

.graph-item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.92);
  color: var(--color-text-secondary);
  font-size: 11px;
}

.action-btn:hover {
  background: rgba(226, 232, 240, 0.95);
  color: var(--color-text);
}

.action-btn-danger {
  color: var(--color-danger);
}
</style>
