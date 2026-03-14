<template>
  <aside class="app-sidebar">
    <div class="sidebar-topbar">
      <div class="sidebar-brand">Graph Workspace</div>
      <div class="sidebar-caption">先选工作区，再进入它的会话和文件。</div>
    </div>

    <div class="sidebar-scroll">
      <GraphList />
    </div>

    <div class="sidebar-footer">
      <button class="settings-btn" @click="settingsOpen = !settingsOpen">
        <span>⚙</span>
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
import { ref } from 'vue'
import GraphList from '@/components/import/GraphList.vue'
import ApiSettings from '@/components/rag/ApiSettings.vue'

const settingsOpen = ref(false)
</script>

<style scoped>
.app-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fbfbf8 0%, #f1f3ee 100%);
  border-right: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
}
.sidebar-topbar {
  padding: 18px 16px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.66);
}
.sidebar-brand {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sidebar-caption {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px 88px;
}
.sidebar-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px 14px;
  background: linear-gradient(180deg, rgba(241, 243, 238, 0), rgba(241, 243, 238, 0.98) 40%);
}
.settings-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
  font-weight: 600;
  color: var(--color-text);
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
.settings-sheet-kicker {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
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
</style>
