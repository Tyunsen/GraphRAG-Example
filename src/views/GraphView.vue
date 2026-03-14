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
          <div class="intro-kicker">系统介绍</div>
          <div class="intro-title">把工作区当成一个可上传文件的研究项目</div>
          <div class="intro-copy">
            先在左侧创建或选择工作区，再进入这个工作区下的子会话。文件管理也绑定在工作区内部，而不是全局平铺。
          </div>
          <div class="intro-steps">
            <div class="intro-step">
              <strong>1. 选择工作区</strong>
              <span>确定这个项目的主题和总意图。</span>
            </div>
            <div class="intro-step">
              <strong>2. 管理子会话</strong>
              <span>每个工作区可以有多条聊天会话，彼此独立。</span>
            </div>
            <div class="intro-step">
              <strong>3. 上传文件</strong>
              <span>文件会进入当前工作区，并围绕当前意图生成图谱。</span>
            </div>
            <div class="intro-step">
              <strong>4. 查看右侧图谱</strong>
              <span>未选消息时显示整个工作区图谱，点选消息后切成该消息的证据子图。</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="workspace-main-inner">
        <div class="workspace-main-header">
          <div>
            <div class="workspace-main-title">{{ graphStore.currentGraphMeta.name }}</div>
            <div class="workspace-main-intent">{{ graphStore.currentGraphMeta.intentQuery }}</div>
          </div>
        </div>

        <div class="workspace-main-body">
          <ChatPanel v-if="activePanel === 'chat'" />
          <WorkspaceFilesPanel v-else />
        </div>
      </div>
    </main>

    <aside class="graph-stage-shell">
      <div v-if="!graphStore.currentGraphMeta" class="graph-intro">
        <div class="graph-intro-kicker">Graph</div>
        <div class="graph-intro-title">右侧始终是图谱区域</div>
        <div class="graph-intro-copy">
          选中工作区后，这里会显示该工作区的完整图谱。点选具体消息后，图谱会自动聚焦到该消息检索到的证据子图。
        </div>
      </div>

      <template v-else>
        <div class="graph-stage-header">
          <div>
            <div class="graph-stage-title">{{ graphStore.isFocusedView ? '当前消息子图' : '当前工作区图谱' }}</div>
            <div class="graph-stage-subtitle">
              {{ graphStore.isFocusedView ? '点击消息后自动聚焦到该次问答使用的上下文子图。' : '当前显示整个工作区的图谱。' }}
            </div>
          </div>
          <button v-if="graphStore.isFocusedView" class="graph-stage-action" @click="graphStore.showFullGraph()">查看全图</button>
        </div>

        <div class="graph-stage">
          <GraphCanvas />
        </div>
      </template>
    </aside>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import WorkspaceNavigator from '@/components/workspace/WorkspaceNavigator.vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'
import ChatPanel from '@/components/rag/ChatPanel.vue'
import WorkspaceFilesPanel from '@/components/workspace/WorkspaceFilesPanel.vue'
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()
const activePanel = ref('chat')

watch(() => graphStore.currentGraphId, () => {
  activePanel.value = 'chat'
})
</script>

<style scoped>
.graph-view {
  display: grid;
  grid-template-columns: 300px 280px minmax(0, 1fr) 420px;
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
.workspace-main-header {
  padding: 24px 24px 18px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
}
.workspace-main-title {
  font-size: 24px;
  font-weight: 700;
}
.workspace-main-intent {
  margin-top: 6px;
  max-width: 760px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.workspace-main-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
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
}
.graph-stage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--color-border);
}
.graph-stage-title {
  font-size: 15px;
  font-weight: 700;
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
    grid-template-columns: 280px 250px minmax(0, 1fr) 360px;
  }
}

@media (max-width: 1100px) {
  .graph-view {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .workspace-nav-shell,
  .graph-stage-shell {
    display: none;
  }
}
</style>
