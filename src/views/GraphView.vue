<template>
  <div class="graph-view">
    <div class="workspace-sidebar">
      <AppSidebar />
    </div>

    <div class="workspace-nav-shell">
      <WorkspaceNavigator v-model:activePanel="activePanel" />
    </div>

    <main class="workspace-main">
      <div v-if="!graphStore.currentGraphMeta" class="workspace-intro">
        <div class="intro-panel">
          <div class="intro-kicker">Workspace Graph RAG</div>
          <div class="intro-title">把一个工作区当成一个持续生长的研究项目</div>
          <div class="intro-copy">
            从左侧选择或创建工作区。每个工作区都拥有自己的文件、会话与图谱。
          </div>
          <div class="intro-steps">
            <div class="intro-step">
              <strong>创建工作区</strong>
              <span>先定义总意图，再围绕这个意图导入资料。</span>
            </div>
            <div class="intro-step">
              <strong>管理会话</strong>
              <span>同一工作区下可以展开多条独立对话链路。</span>
            </div>
            <div class="intro-step">
              <strong>导入文件</strong>
              <span>系统会按工作区意图抽取实体、事件和证据段落。</span>
            </div>
            <div class="intro-step">
              <strong>追踪证据</strong>
              <span>右侧默认显示工作区全图，点击消息后切换到该消息子图。</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="workspace-main-inner">
        <div class="workspace-main-body">
          <ChatPanel v-if="activePanel === 'chat'" />
          <WorkspaceFilesPanel v-else />
        </div>
      </div>
    </main>

    <aside class="graph-stage-shell">
      <div v-if="!graphStore.currentGraphMeta" class="graph-intro">
        <div class="graph-intro-kicker">Graph View</div>
        <div class="graph-intro-title">右侧始终是图谱视图</div>
        <div class="graph-intro-copy">
          工作区默认显示全图，选中消息后自动聚焦到该消息对应的证据子图。
        </div>
      </div>

      <template v-else>
        <div class="graph-stage-header">
          <div class="graph-stage-header-copy">
            <div class="graph-stage-title">{{ graphPanelTitle }}</div>
            <div class="graph-stage-subtitle">
              {{ graphStore.isFocusedView ? '该消息对应的证据子图' : '当前工作区全图' }}
            </div>
          </div>
          <button v-if="graphStore.isFocusedView" class="graph-stage-action" @click="graphStore.showFullGraph()">
            查看全图
          </button>
        </div>

        <div class="graph-stage">
          <GraphCanvas />
        </div>
      </template>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import WorkspaceNavigator from '@/components/workspace/WorkspaceNavigator.vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'
import ChatPanel from '@/components/rag/ChatPanel.vue'
import WorkspaceFilesPanel from '@/components/workspace/WorkspaceFilesPanel.vue'
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'

const graphStore = useGraphStore()
const ragStore = useRagStore()
const activePanel = ref('chat')

const activeMessage = computed(() =>
  ragStore.messages.find(item => item.id === ragStore.activeMessageId) || null
)

const graphPanelTitle = computed(() => {
  if (!graphStore.isFocusedView) return graphStore.currentGraphMeta?.name || '工作区图谱'

  const text = activeMessage.value?.content?.trim()
  if (!text) return '当前消息'
  return text.length > 26 ? `${text.slice(0, 26)}...` : text
})

watch(() => graphStore.currentGraphId, () => {
  activePanel.value = 'chat'
})
</script>

<style scoped>
.graph-view {
  display: grid;
  grid-template-columns:
    clamp(232px, 18vw, 280px)
    clamp(220px, 16vw, 260px)
    minmax(0, 1.18fr)
    minmax(320px, 0.92fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.workspace-sidebar,
.workspace-nav-shell,
.graph-stage-shell {
  min-width: 0;
  overflow: hidden;
}

.workspace-main {
  min-width: 0;
  min-height: 0;
  background: linear-gradient(180deg, #ffffff 0%, #f8f9fb 100%);
}

.workspace-main-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.workspace-main-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 24px;
}

.workspace-intro,
.graph-intro {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.intro-panel,
.graph-intro {
  width: 100%;
  max-width: 760px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 251, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  padding: 28px;
}

.intro-kicker,
.graph-intro-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.intro-title,
.graph-intro-title {
  margin-top: 8px;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 700;
}

.intro-copy,
.graph-intro-copy {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.intro-steps {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.intro-step {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.intro-step strong {
  font-size: 13px;
}

.intro-step span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.graph-stage-shell {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: linear-gradient(180deg, #f9fafb 0%, #f3f5f8 100%);
  min-width: 0;
}

.graph-stage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--color-border);
}

.graph-stage-header-copy {
  min-width: 0;
}

.graph-stage-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.graph-stage-subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.graph-stage-action {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}

.graph-stage {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1400px) {
  .graph-view {
    grid-template-columns:
      224px
      212px
      minmax(0, 1.08fr)
      minmax(300px, 0.88fr);
  }

  .workspace-main-body {
    padding: 20px;
  }
}

@media (max-width: 1100px) {
  .graph-view {
    grid-template-columns: 220px minmax(0, 1fr) 320px;
  }

  .workspace-nav-shell {
    display: none;
  }
}
</style>
