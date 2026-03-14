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
          <div class="workspace-card-head">
            <div>
              <div class="workspace-title">{{ editingId ? '编辑工作区' : '新建工作区' }}</div>
              <div class="workspace-subtitle">
                工作区决定抽取范围、文件筛选逻辑和后续会话的上下文边界。
              </div>
            </div>
            <button class="workspace-close" type="button" @click="closePanel">关闭</button>
          </div>

          <div class="workspace-grid">
            <section class="workspace-section">
              <div class="field-head">
                <div class="field-title-row">
                  <label class="field-label" for="workspace-name">工作区名称</label>
                  <span class="field-hint">显示在左侧列表</span>
                </div>
              </div>
              <input
                id="workspace-name"
                v-model="form.name"
                class="input workspace-name"
                placeholder="例如：伊朗局势"
              />
            </section>

            <section class="workspace-section">
              <div class="field-head">
                <div class="field-title-row">
                  <label class="field-label" for="workspace-intent">工作区意图</label>
                  <span class="field-hint">决定抽取范围和问答边界</span>
                </div>
              </div>
              <textarea
                id="workspace-intent"
                v-model="form.intentQuery"
                class="input workspace-intent"
                placeholder="例如：只看中国相关的表态、行动与影响"
              />
            </section>

            <section class="workspace-section workspace-section-full">
              <div class="field-head field-head-inline">
                <div>
                  <label class="field-label" for="workspace-prompt">抽取提示词</label>
                  <div class="field-copy">这是发给大模型的抽取指令。留空时，系统会按当前工作区意图自动生成。</div>
                </div>
                <div class="field-actions">
                  <button class="mini-btn" type="button" :disabled="!form.intentQuery.trim() || generatingPrompt" @click="generatePrompt">
                    {{ generatingPrompt ? '生成中...' : '按意图生成' }}
                  </button>
                  <button class="mini-btn mini-btn-ghost" type="button" @click="resetPromptToAuto">
                    改回自动生成
                  </button>
                </div>
              </div>
              <textarea
                id="workspace-prompt"
                v-model="form.extractionPrompt"
                class="input workspace-prompt"
                placeholder="这里会显示当前工作区的抽取提示词。"
              />
            </section>
          </div>

          <div class="workspace-actions">
            <button class="btn btn-secondary" @click="closePanel">取消</button>
            <button class="btn btn-primary" :disabled="!form.intentQuery.trim() || saving" @click="submitPanel">
              {{ saving ? '保存中...' : editingId ? '保存工作区' : '创建工作区' }}
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
import { previewWorkspacePromptApi } from '@/services/apiClient'

const graphStore = useGraphStore()

const creating = ref(false)
const editingId = ref(null)
const generatingPrompt = ref(false)
const saving = ref(false)
const form = reactive({
  name: '',
  intentQuery: '',
  extractionPrompt: ''
})

const workspaceList = computed(() => graphStore.savedGraphs)

function resetForm() {
  form.name = ''
  form.intentQuery = ''
  form.extractionPrompt = ''
}

function getWorkspaceNameFromIntent(intentQuery = '') {
  const text = String(intentQuery || '').trim()
  if (!text) return '未命名工作区'
  return text.length > 18 ? `${text.slice(0, 18)}...` : text
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
  form.extractionPrompt = workspace.extractionPrompt || ''
}

function closePanel() {
  creating.value = false
  editingId.value = null
  generatingPrompt.value = false
  saving.value = false
  resetForm()
}

async function generatePrompt() {
  const intentQuery = form.intentQuery.trim()
  if (!intentQuery) return

  generatingPrompt.value = true
  try {
    const response = await previewWorkspacePromptApi({
      name: String(form.name || '').trim(),
      intentQuery
    })
    form.extractionPrompt = response?.extractionPrompt || ''
  } finally {
    generatingPrompt.value = false
  }
}

function resetPromptToAuto() {
  form.extractionPrompt = ''
}

async function submitPanel() {
  const intentQuery = form.intentQuery.trim()
  if (!intentQuery || saving.value) return

  saving.value = true
  const payload = {
    name: String(form.name || '').trim() || getWorkspaceNameFromIntent(intentQuery),
    intentQuery,
    intentSummary: '',
    extractionPrompt: String(form.extractionPrompt || '').trim()
  }

  try {
    if (editingId.value) {
      await graphStore.renameGraph(editingId.value, payload)
    } else {
      await graphStore.createWorkspace(payload)
    }
    closePanel()
  } finally {
    saving.value = false
  }
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
  width: min(920px, calc(100vw - 40px));
  max-height: calc(100vh - 48px);
  display: grid;
  gap: 20px;
  padding: 28px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(246, 248, 251, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.22);
  overflow: auto;
}

.workspace-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.workspace-title {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.workspace-close {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.96);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.workspace-section {
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  display: grid;
  gap: 8px;
  box-shadow: none;
}

.workspace-section-full {
  grid-column: 1 / -1;
}

.field-head {
  display: grid;
  gap: 4px;
}

.field-head-inline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.field-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.field-copy {
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.mini-btn {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.mini-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.mini-btn-ghost {
  background: rgba(241, 245, 249, 0.95);
  color: var(--color-text-secondary);
}

.workspace-name {
  height: 56px;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(255, 255, 255, 1);
  box-shadow: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.workspace-intent {
  height: 148px;
  resize: none;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(255, 255, 255, 1);
  box-shadow: none;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text);
}

.workspace-prompt {
  min-height: 280px;
  resize: vertical;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 1);
  box-shadow: none;
  font-size: 13px;
  line-height: 1.7;
  font-family: var(--font-mono);
}

.workspace-name:focus,
.workspace-intent:focus,
.workspace-prompt:focus {
  outline: none;
  border-color: rgba(79, 109, 245, 0.72);
  box-shadow: 0 0 0 4px rgba(79, 109, 245, 0.08);
}

.workspace-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.workspace-panel-enter-active,
.workspace-panel-leave-active {
  transition: opacity 0.18s ease;
}

.workspace-panel-enter-from,
.workspace-panel-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .workspace-overlay {
    padding: 16px;
  }

  .workspace-card {
    width: min(100vw - 24px, 100%);
    padding: 20px;
    border-radius: 20px;
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .field-head-inline {
    flex-direction: column;
  }

  .field-title-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .field-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
