<template>
  <aside class="app-sidebar">
    <div class="sidebar-main">
      <section class="sidebar-section workspace-section">
        <div class="section-kicker">Workspace</div>
        <div class="section-heading">
          <h2>工作区</h2>
          <p>先选择工作区，再进入会话或文件管理。</p>
        </div>
        <div class="workspace-list-shell">
          <GraphList />
        </div>
      </section>

      <section v-if="graphStore.currentGraphMeta" class="sidebar-section current-workspace-section">
        <div class="current-workspace-card">
          <div class="workspace-card-label">当前工作区</div>
          <div class="workspace-card-title">{{ graphStore.currentGraphMeta.name }}</div>
          <div class="workspace-card-intent">{{ graphStore.currentGraphMeta.intentQuery }}</div>
          <div class="workspace-card-meta">
            <span>{{ graphStore.currentGraphMeta.fileCount || 0 }} 文档</span>
            <span>{{ graphStore.currentGraphMeta.sessionCount || 0 }} 会话</span>
            <span>{{ graphStore.currentGraphMeta.nodeCount || 0 }} 节点</span>
          </div>
        </div>

        <div class="workspace-nav">
          <button
            class="workspace-nav-btn"
            :class="{ active: activePanel === 'chat' }"
            @click="activePanel = 'chat'"
          >会话</button>
          <button
            class="workspace-nav-btn"
            :class="{ active: activePanel === 'files' }"
            @click="activePanel = 'files'"
          >文件管理</button>
        </div>

        <div class="workspace-stage">
          <div v-if="activePanel === 'chat'" class="stage-panel">
            <ChatPanel />
          </div>

          <div v-else class="stage-panel">
            <div class="files-stage-header">
              <div class="stage-title">导入文件</div>
              <div class="stage-desc">文件先进入当前工作区，再围绕当前意图抽取实体、事件和关系。</div>
            </div>

            <FileImporter
              :disabled="!graphStore.currentGraphId || !graphStore.currentIntentQuery"
              @files-selected="onFilesSelected"
            />

            <div v-if="extracting" class="status-card status-info">
              <span class="status-spinner"></span>
              <span>AI 正在按工作区意图分析文档并抽取节点与事件。</span>
            </div>
            <div v-else-if="parsing" class="status-card">正在解析文件内容...</div>
            <div v-if="parseError" class="status-card status-error">{{ parseError }}</div>

            <ImportPreview :result="lastResult" @confirm="confirmImport" @cancel="cancelImport" />
            <ImportHistory />
          </div>
        </div>
      </section>

      <section v-else class="sidebar-section empty-section">
        <div class="empty-card">
          <div class="empty-title">先创建一个工作区</div>
          <div class="empty-desc">工作区是图谱、文件和会话的上层容器。先定义总意图，再开始导入和问答。</div>
        </div>
      </section>
    </div>

    <div class="sidebar-footer">
      <button class="settings-trigger" @click="settingsOpen = !settingsOpen">
        <span class="settings-trigger-icon">⚙</span>
        <span>设置</span>
      </button>
    </div>

    <transition name="settings-sheet">
      <div v-if="settingsOpen" class="settings-sheet">
        <div class="settings-sheet-header">
          <div>
            <div class="settings-sheet-kicker">Settings</div>
            <div class="settings-sheet-title">模型与抽取配置</div>
          </div>
          <button class="settings-close" @click="settingsOpen = false">关闭</button>
        </div>
        <div class="settings-sheet-body">
          <ApiSettings />
        </div>
      </div>
    </transition>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useFileParser } from '@/composables/useFileParser'
import { useGraphStore } from '@/stores/graphStore'
import GraphList from '@/components/import/GraphList.vue'
import FileImporter from '@/components/import/FileImporter.vue'
import ImportPreview from '@/components/import/ImportPreview.vue'
import ImportHistory from '@/components/import/ImportHistory.vue'
import ChatPanel from '@/components/rag/ChatPanel.vue'
import ApiSettings from '@/components/rag/ApiSettings.vue'

const graphStore = useGraphStore()
const activePanel = ref('chat')
const settingsOpen = ref(false)
const { parsing, extracting, parseError, lastResult, parseFile, confirmImport, cancelImport } = useFileParser()

watch(() => graphStore.currentGraphId, () => {
  activePanel.value = 'chat'
})

async function onFilesSelected(files) {
  for (const file of files) {
    try {
      await parseFile(file)
    } catch {
      // parseError already captures the user-visible message.
    }
  }
}
</script>

<style scoped>
.app-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(79, 109, 245, 0.08), transparent 32%),
    linear-gradient(180deg, #fcfdff 0%, #f6f8fc 100%);
  border-right: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
}
.sidebar-main {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px 92px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sidebar-section {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
  border-radius: 18px;
  overflow: hidden;
  backdrop-filter: blur(12px);
}
.workspace-section {
  padding: 14px;
}
.section-kicker,
.settings-sheet-kicker,
.workspace-card-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.section-heading {
  margin-top: 6px;
  margin-bottom: 12px;
}
.section-heading h2 {
  font-size: 20px;
  line-height: 1.1;
  margin-bottom: 4px;
}
.section-heading p {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
.workspace-list-shell {
  max-height: 34vh;
  overflow-y: auto;
  padding-right: 4px;
}
.current-workspace-section {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.current-workspace-card {
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(79, 109, 245, 0.1), rgba(255, 255, 255, 0.94));
  border: 1px solid rgba(79, 109, 245, 0.14);
}
.workspace-card-title {
  font-size: 18px;
  font-weight: 700;
  margin-top: 4px;
  margin-bottom: 6px;
}
.workspace-card-intent {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.workspace-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.workspace-card-meta span {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--color-text-secondary);
}
.workspace-nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.workspace-nav-btn {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.9);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.18s ease;
}
.workspace-nav-btn:hover {
  background: rgba(226, 232, 240, 0.95);
  color: var(--color-text);
}
.workspace-nav-btn.active {
  background: linear-gradient(135deg, var(--color-primary), #6d86fb);
  color: #fff;
  box-shadow: 0 10px 24px rgba(79, 109, 245, 0.24);
}
.workspace-stage {
  min-height: 0;
}
.stage-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-title {
  font-size: 14px;
  font-weight: 700;
}
.stage-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
.status-card {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.85);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
}
.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
  background: rgba(239, 246, 255, 0.92);
  border-color: rgba(147, 197, 253, 0.85);
}
.status-error {
  background: rgba(254, 242, 242, 0.92);
  border-color: rgba(252, 165, 165, 0.8);
  color: var(--color-danger);
}
.status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(79, 109, 245, 0.2);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.empty-section {
  padding: 16px;
}
.empty-card {
  border-radius: 16px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px dashed rgba(148, 163, 184, 0.4);
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}
.empty-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.sidebar-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px 14px;
  background: linear-gradient(180deg, rgba(246, 248, 252, 0), rgba(246, 248, 252, 0.96) 38%);
}
.settings-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
  font-weight: 600;
  color: var(--color-text);
}
.settings-trigger:hover {
  background: #fff;
}
.settings-trigger-icon {
  font-size: 14px;
}
.settings-sheet {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 74px;
  max-height: min(70vh, 820px);
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(16px);
  overflow: hidden;
}
.settings-sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border-light);
}
.settings-sheet-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
}
.settings-close {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.95);
  color: var(--color-text-secondary);
  font-size: 12px;
}
.settings-sheet-body {
  overflow-y: auto;
  padding: 0 16px 16px;
}
.settings-sheet-enter-active,
.settings-sheet-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.settings-sheet-enter-from,
.settings-sheet-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
