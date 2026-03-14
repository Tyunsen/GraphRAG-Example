<template>
  <div class="graph-list">
    <div v-if="graphStore.savedGraphs.length === 0" class="graph-list-empty">
      <p>还没有工作区</p>
      <button class="empty-create-btn" @click="openCreatePanel">创建第一个工作区</button>
    </div>

    <div v-else class="graph-list-items">
      <button
        v-for="workspace in workspaceList"
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
          <div v-if="workspace.intentQuery" class="graph-item-intent">{{ workspace.intentQuery }}</div>
          <div class="graph-item-time">{{ formatTime(workspace.updatedAt || workspace.createdAt) }}</div>
        </div>

        <div class="graph-item-actions" @click.stop>
          <button class="action-btn" title="编辑工作区" @click="openEditPanel(workspace)">编辑</button>
          <button class="action-btn action-btn-danger" title="删除工作区" @click="deleteGraph(workspace.id)">删除</button>
        </div>
      </button>
    </div>

    <transition name="workspace-panel">
      <div v-if="creating || editingId" class="workspace-overlay" @click="closePanel">
        <div class="workspace-card" @click.stop>
          <div class="workspace-kicker">{{ editingId ? '编辑工作区' : '新建工作区' }}</div>
          <div class="workspace-title">{{ editingId ? '更新工作区意图与抽取范围' : '先定义工作区意图，再持续导入文档' }}</div>
          <div class="workspace-copy">
            工作区意图会直接参与抽取提示和筛选逻辑。模型只围绕这里定义的主题、范围和关注对象构图。
          </div>

          <div class="workspace-fields">
            <input
              v-model="form.name"
              class="input workspace-input"
              placeholder="工作区名称，例如：伊朗局势"
            />
            <textarea
              v-model="form.intentQuery"
              class="input workspace-intent"
              placeholder="工作区总意图，例如：只看中国相关的表态、行动与影响"
            />
            <textarea
              v-model="form.intentSummary"
              class="input workspace-summary"
              placeholder="抽取补充说明，例如：重点关注中国官方表态、外交动作、经济影响，弱相关内容直接忽略"
            />
          </div>

          <div class="workspace-actions">
            <button class="btn btn-secondary" @click="closePanel">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!form.intentQuery.trim()"
              @click="submitPanel"
            >
              {{ editingId ? '保存修改' : '创建工作区' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()

const creating = ref(false)
const editingId = ref(null)
const form = reactive({
  name: '',
  intentQuery: '',
  intentSummary: ''
})

const workspaceList = computed(() => graphStore.savedGraphs)

function resetForm() {
  form.name = ''
  form.intentQuery = ''
  form.intentSummary = ''
}

async function loadGraph(graphId) {
  if (creating.value || editingId.value || graphStore.currentGraphId === graphId) return
  await graphStore.loadGraph(graphId)
}

function openCreatePanel() {
  creating.value = true
  editingId.value = null
  resetForm()
}

function openEditPanel(workspace) {
  creating.value = false
  editingId.value = workspace.id
  form.name = workspace.name || ''
  form.intentQuery = workspace.intentQuery || ''
  form.intentSummary = workspace.intentSummary || ''
}

function closePanel() {
  creating.value = false
  editingId.value = null
  resetForm()
}

async function submitPanel() {
  if (!form.intentQuery.trim()) return

  if (editingId.value) {
    await graphStore.renameGraph(editingId.value, {
      name: form.name.trim() || '未命名工作区',
      intentQuery: form.intentQuery.trim(),
      intentSummary: form.intentSummary.trim()
    })
  } else {
    await graphStore.createWorkspace({
      name: form.name.trim() || '未命名工作区',
      intentQuery: form.intentQuery.trim(),
      intentSummary: form.intentSummary.trim()
    })
  }

  closePanel()
}

async function deleteGraph(graphId) {
  await graphStore.deleteSavedGraph(graphId)
  if (editingId.value === graphId) closePanel()
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
  transition: background 0.15s ease, border-color 0.15s ease;
}

.graph-item:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(148, 163, 184, 0.24);
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
.graph-item-time,
.graph-item-intent {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.graph-item-meta {
  margin-top: 4px;
}

.graph-item-intent {
  margin-top: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.workspace-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.workspace-card {
  width: min(680px, calc(100vw - 32px));
  display: grid;
  gap: 14px;
  padding: 28px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.22);
}

.workspace-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.workspace-title {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
}

.workspace-copy {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.workspace-fields {
  display: grid;
  gap: 12px;
}

.workspace-intent,
.workspace-summary {
  min-height: 112px;
  resize: none;
}

.workspace-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .workspace-card {
    padding: 22px;
    border-radius: 22px;
  }

  .workspace-title {
    font-size: 22px;
  }
}
</style>
