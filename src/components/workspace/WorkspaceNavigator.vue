<template>
  <aside class="workspace-nav">
    <div v-if="!graphStore.currentGraphMeta" class="workspace-nav-empty">
      <div class="workspace-nav-empty-title">选择工作区</div>
    </div>

    <template v-else>
      <div class="workspace-nav-header">
        <div class="workspace-nav-kicker">当前工作区</div>
        <div class="workspace-nav-title">{{ graphStore.currentGraphMeta.name }}</div>
        <div v-if="graphStore.currentGraphMeta.intentQuery" class="workspace-nav-intent">
          {{ graphStore.currentGraphMeta.intentQuery }}
        </div>
      </div>

      <div class="workspace-nav-tabs">
        <button class="workspace-nav-tab" :class="{ active: activePanel === 'chat' }" @click="$emit('update:activePanel', 'chat')">
          会话
        </button>
        <button class="workspace-nav-tab" :class="{ active: activePanel === 'files' }" @click="$emit('update:activePanel', 'files')">
          文件
        </button>
      </div>

      <div v-if="activePanel === 'chat'" class="workspace-nav-section">
        <div class="section-head">
          <div class="section-title">会话</div>
          <button class="section-action" @click="ragStore.createSession()">新对话</button>
        </div>

        <div v-if="ragStore.sessions.length === 0" class="section-empty">还没有会话</div>
        <div v-else class="session-list">
          <div
            v-for="session in ragStore.sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: ragStore.currentSessionId === session.id }"
          >
            <button class="session-main" @click="ragStore.switchSession(session.id)">
              <span class="session-title">{{ displaySessionTitle(session.title) }}</span>
            </button>
            <button class="session-delete" title="删除会话" @click="removeSession(session.id)">删除</button>
          </div>
        </div>
      </div>

      <div v-else class="workspace-nav-section">
        <div class="section-head">
          <div class="section-title">文件</div>
        </div>

        <div class="file-summary-list">
          <div class="file-summary-item">
            <span>文档</span>
            <strong>{{ graphStore.currentGraphMeta.fileCount || 0 }}</strong>
          </div>
          <div class="file-summary-item">
            <span>节点</span>
            <strong>{{ graphStore.currentGraphMeta.nodeCount || 0 }}</strong>
          </div>
          <div class="file-summary-item">
            <span>关系</span>
            <strong>{{ graphStore.currentGraphMeta.edgeCount || 0 }}</strong>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { watch } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'
import { useRagQuery } from '@/composables/useRagQuery'

defineProps({
  activePanel: { type: String, required: true }
})

defineEmits(['update:activePanel'])

const graphStore = useGraphStore()
const ragStore = useRagStore()
const { refreshWorkspaceSessionTitles } = useRagQuery()

watch(
  () => [graphStore.currentGraphId, ragStore.sessions.length],
  async ([graphId]) => {
    if (!graphId || ragStore.sessions.length === 0) return
    await refreshWorkspaceSessionTitles()
  },
  { immediate: true }
)

function displaySessionTitle(title) {
  const value = title?.trim()
  if (!value || value === '默认会话' || value === '新会话') return '开始对话'
  return value
}

async function removeSession(sessionId) {
  await ragStore.deleteSession(sessionId)
}
</script>

<style scoped>
.workspace-nav {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 16px;
  background: rgba(250, 250, 248, 0.94);
  border-right: 1px solid var(--color-border);
}

.workspace-nav-empty {
  margin-top: auto;
  margin-bottom: auto;
  text-align: center;
  color: var(--color-text-muted);
}

.workspace-nav-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.workspace-nav-header {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border-light);
}

.workspace-nav-kicker {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.workspace-nav-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
}

.workspace-nav-intent {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.workspace-nav-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.workspace-nav-tab {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.95);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.workspace-nav-tab.active {
  background: var(--color-text);
  color: #fff;
}

.workspace-nav-section {
  margin-top: 14px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
}

.section-action {
  padding: 7px 9px;
  border-radius: 9px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
}

.section-empty {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid transparent;
  padding: 4px;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(148, 163, 184, 0.24);
}

.session-item.active {
  background: rgba(79, 109, 245, 0.08);
  border-color: rgba(79, 109, 245, 0.28);
}

.session-main {
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 8px;
  color: var(--color-text);
}

.session-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-delete {
  flex-shrink: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(254, 242, 242, 0.92);
  color: var(--color-danger);
  font-size: 11px;
}

.file-summary-list {
  display: grid;
  gap: 8px;
}

.file-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-summary-item strong {
  color: var(--color-text);
}
</style>
