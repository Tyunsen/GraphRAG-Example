<template>
  <aside class="app-sidebar">
    <div class="sidebar-topbar">
      <div>
        <div class="sidebar-brand">Workspace</div>
        <div class="sidebar-caption">工作区在这里，子会话也在这里。</div>
      </div>
    </div>

    <div class="sidebar-scroll">
      <section class="sidebar-block">
        <div class="block-title">工作区</div>
        <div class="block-subtitle">先选工作区，再打开它的子会话和文件。</div>
        <GraphList />
      </section>

      <section v-if="graphStore.currentGraphMeta" class="sidebar-block">
        <div class="block-title-row">
          <div>
            <div class="block-title">子会话</div>
            <div class="block-subtitle">{{ graphStore.currentGraphMeta.name }}</div>
          </div>
          <button class="new-session-btn" @click="ragStore.createSession()">新会话</button>
        </div>

        <div v-if="ragStore.sessions.length === 0" class="session-empty">
          当前工作区还没有会话。
        </div>
        <div v-else class="session-list">
          <button
            v-for="session in ragStore.sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: ragStore.currentSessionId === session.id }"
            @click="ragStore.switchSession(session.id)"
          >
            <span class="session-item-title">{{ session.title }}</span>
          </button>
        </div>
      </section>

      <section v-else class="sidebar-block empty-block">
        <div class="empty-block-title">先创建工作区</div>
        <div class="empty-block-desc">没有工作区时，不显示子会话，也不进入文件管理。</div>
      </section>
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
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'
import GraphList from '@/components/import/GraphList.vue'
import ApiSettings from '@/components/rag/ApiSettings.vue'

const graphStore = useGraphStore()
const ragStore = useRagStore()
const settingsOpen = ref(false)
</script>

<style scoped>
.app-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fbfbf8 0%, #f3f4ef 100%);
  border-right: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
}
.sidebar-topbar {
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(255, 255, 255, 0.65);
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
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sidebar-block {
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}
.block-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.block-title {
  font-size: 14px;
  font-weight: 700;
}
.block-subtitle,
.empty-block-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.new-session-btn {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}
.session-empty {
  font-size: 12px;
  color: var(--color-text-muted);
}
.session-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.session-item {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  text-align: left;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid transparent;
  color: var(--color-text-secondary);
}
.session-item:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(148, 163, 184, 0.24);
}
.session-item.active {
  background: rgba(79, 109, 245, 0.08);
  border-color: rgba(79, 109, 245, 0.26);
  color: var(--color-text);
}
.session-item-title {
  font-size: 12px;
  font-weight: 600;
}
.empty-block-title {
  font-size: 16px;
  font-weight: 700;
}
.sidebar-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px 14px;
  background: linear-gradient(180deg, rgba(243, 244, 239, 0), rgba(243, 244, 239, 0.98) 40%);
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
