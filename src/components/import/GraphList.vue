<template>
  <div class="graph-list">
    <div class="graph-list-header">
      <h4>工作区列表</h4>
      <button class="btn btn-sm btn-primary" @click="toggleCreate">
        {{ creating ? '取消' : '新建' }}
      </button>
    </div>

    <div v-if="creating" class="workspace-form">
      <input class="input" v-model="createName" placeholder="工作区名称，例如：伊朗战争追踪" />
      <textarea
        class="input workspace-intent"
        v-model="createIntent"
        placeholder="工作区总意图，例如：围绕 2026 年伊朗战争局势，抽取军事打击、核设施、油价与航运风险相关的实体、事件和事件链。"
      />
      <button class="btn btn-primary btn-block" @click="submitCreate">创建工作区</button>
    </div>

    <div v-if="graphStore.savedGraphs.length === 0" class="graph-list-empty">
      <p>暂无工作区</p>
      <p class="text-muted">先建工作区并填写总意图，再导入文件。</p>
    </div>

    <div class="graph-list-items" v-else>
      <div
        v-for="workspace in sortedGraphs"
        :key="workspace.id"
        class="graph-item"
        :class="{ active: graphStore.currentGraphId === workspace.id }"
      >
        <div class="graph-item-main" @click="loadGraph(workspace.id)">
          <div v-if="editingId === workspace.id" class="workspace-form inline-form" @click.stop>
            <input class="input" v-model="editName" placeholder="工作区名称" />
            <textarea
              class="input workspace-intent"
              v-model="editIntent"
              placeholder="输入这个工作区的总意图，后续导入将按该意图抽取。"
            />
            <div class="inline-actions">
              <button class="btn btn-sm btn-primary" @click="confirmEdit">保存</button>
              <button class="btn btn-sm btn-secondary" @click="cancelEdit">取消</button>
            </div>
          </div>

          <div v-else class="graph-item-info">
            <span class="graph-item-name">{{ workspace.name }}</span>
            <span class="graph-item-meta">
              {{ workspace.nodeCount }} 节点 · {{ workspace.edgeCount }} 关系 · {{ workspace.fileCount || 0 }} 文档 · {{ workspace.sessionCount || 0 }} 会话
            </span>
            <span class="graph-item-intent">{{ workspace.intentQuery }}</span>
            <span class="graph-item-time">{{ formatTime(workspace.updatedAt || workspace.createdAt) }}</span>
          </div>

          <div v-if="graphStore.currentGraphId === workspace.id" class="graph-item-active-badge">当前</div>
        </div>

        <div class="graph-item-actions">
          <button class="action-btn" title="编辑工作区" @click.stop="startEdit(workspace)">✎</button>
          <button class="action-btn action-btn-danger" title="删除工作区" @click.stop="deleteGraph(workspace.id)">✕</button>
        </div>
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
  if (editingId.value) return
  if (graphStore.currentGraphId === graphId) return
  await graphStore.loadGraph(graphId)
}

function toggleCreate() {
  creating.value = !creating.value
  if (!creating.value) {
    createName.value = ''
    createIntent.value = ''
  }
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
  editingId.value = null
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
  const isToday = date.toDateString() === now.toDateString()
  const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  if (isToday) return time
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${time}`
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
.workspace-form {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.inline-form {
  margin-bottom: 0;
  width: 100%;
}
.workspace-intent {
  min-height: 96px;
  resize: vertical;
}
.inline-actions {
  display: flex;
  gap: 8px;
}
.btn-block {
  width: 100%;
}
.graph-list-empty {
  text-align: center;
  padding: 24px 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.text-muted {
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
  align-items: flex-start;
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
  align-items: flex-start;
  gap: 8px;
}
.graph-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.graph-item-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-item-meta,
.graph-item-time,
.graph-item-intent {
  font-size: 11px;
  color: var(--color-text-secondary);
}
.graph-item-intent {
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
</style>
