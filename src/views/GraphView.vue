<template>
  <div class="graph-view">
    <div class="workspace-sidebar">
      <AppSidebar />
    </div>

    <main class="workspace-main">
      <div v-if="graphStore.currentGraphMeta" class="workspace-main-header">
        <div>
          <div class="workspace-main-title">{{ graphStore.currentGraphMeta.name }}</div>
          <div class="workspace-main-intent">{{ graphStore.currentGraphMeta.intentQuery }}</div>
        </div>
        <div class="workspace-main-tabs">
          <button class="main-tab" :class="{ active: activePanel === 'chat' }" @click="activePanel = 'chat'">对话</button>
          <button class="main-tab" :class="{ active: activePanel === 'files' }" @click="activePanel = 'files'">文件</button>
          <button class="main-tab" :class="{ active: activePanel === 'graph' }" @click="activePanel = 'graph'">图谱</button>
        </div>
      </div>

      <div class="workspace-main-body">
        <div v-if="!graphStore.currentGraphMeta" class="workspace-empty">
          <div class="workspace-empty-title">从左侧选择一个工作区</div>
          <div class="workspace-empty-desc">选中工作区后，这里会显示该工作区的聊天、文件管理和图谱视图。</div>
        </div>

        <ChatPanel v-else-if="activePanel === 'chat'" />
        <WorkspaceFilesPanel v-else-if="activePanel === 'files'" />
        <div v-else class="graph-stage">
          <GraphCanvas />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
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
  grid-template-columns: 340px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.workspace-sidebar {
  min-width: 0;
  overflow: hidden;
}
.workspace-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #ffffff 0%, #f8f9fb 100%);
}
.workspace-main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
.workspace-main-tabs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.main-tab {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.95);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
}
.main-tab.active {
  background: var(--color-text);
  color: #fff;
}
.workspace-main-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
}
.workspace-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-muted);
}
.workspace-empty-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}
.workspace-empty-desc {
  margin-top: 8px;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
}
.graph-stage {
  height: calc(100vh - var(--header-height) - 98px);
  min-height: 560px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: #fff;
}

@media (max-width: 1100px) {
  .graph-view {
    grid-template-columns: 300px minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .graph-view {
    grid-template-columns: 1fr;
  }
  .workspace-sidebar {
    display: none;
  }
  .workspace-main-header {
    flex-direction: column;
  }
  .workspace-main-body {
    padding: 16px;
  }
}
</style>
