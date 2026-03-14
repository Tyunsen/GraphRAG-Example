<template>
  <aside class="app-sidebar">
    <div class="sidebar-topbar">
      <div class="sidebar-brand">图谱工作台</div>
      <button class="sidebar-create" @click="graphListRef?.openCreatePanel()">新建</button>
    </div>

    <div class="sidebar-scroll">
      <GraphList ref="graphListRef" />
    </div>

    <div class="sidebar-footer">
      <button class="settings-btn" @click="settingsOpen = true">
        <span class="settings-icon">⚙</span>
        <span>设置</span>
      </button>
    </div>

    <transition name="settings-overlay">
      <div v-if="settingsOpen" class="settings-overlay" @click="settingsOpen = false">
        <div class="settings-dialog" @click.stop>
          <div class="settings-dialog-header">
            <div>
              <div class="settings-dialog-kicker">系统设置</div>
              <div class="settings-dialog-title">设置</div>
              <div class="settings-dialog-subtitle">按模块管理模型、提示词和后续扩展配置。</div>
            </div>
            <button class="settings-close" @click="settingsOpen = false">关闭</button>
          </div>

          <div class="settings-dialog-body">
            <aside class="settings-menu">
              <button
                v-for="item in settingTabs"
                :key="item.key"
                class="settings-menu-item"
                :class="{ active: activeSettingsTab === item.key }"
                @click="activeSettingsTab = item.key"
              >
                <span class="settings-menu-title">{{ item.label }}</span>
                <span class="settings-menu-desc">{{ item.desc }}</span>
              </button>
            </aside>

            <section class="settings-content">
              <ModelSettingsPanel v-if="activeSettingsTab === 'model'" />
              <ExtractionSettingsPanel v-else />
            </section>
          </div>
        </div>
      </div>
    </transition>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import GraphList from '@/components/import/GraphList.vue'
import ModelSettingsPanel from '@/components/settings/ModelSettingsPanel.vue'
import ExtractionSettingsPanel from '@/components/settings/ExtractionSettingsPanel.vue'

const settingsOpen = ref(false)
const graphListRef = ref(null)
const activeSettingsTab = ref('model')

const settingTabs = [
  { key: 'model', label: '模型', desc: '接口、模型参数、检索' },
  { key: 'extraction', label: '抽取提示词', desc: '意图抽取与模板' }
]
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
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-brand {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-create {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
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
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.22);
  font-weight: 600;
  color: var(--color-text);
}

.settings-icon {
  font-size: 14px;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.settings-dialog {
  width: min(1120px, calc(100vw - 48px));
  height: min(860px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.settings-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.8);
}

.settings-dialog-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.settings-dialog-title {
  margin-top: 6px;
  font-size: 28px;
  font-weight: 700;
}

.settings-dialog-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.settings-close {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.96);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.settings-dialog-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 0;
}

.settings-menu {
  padding: 20px 16px;
  border-right: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(248, 250, 252, 0.72);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-menu-item {
  text-align: left;
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.settings-menu-item:hover {
  background: rgba(255, 255, 255, 0.82);
}

.settings-menu-item.active {
  background: rgba(79, 109, 245, 0.08);
  border-color: rgba(79, 109, 245, 0.24);
}

.settings-menu-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
}

.settings-menu-desc {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.settings-content {
  overflow-y: auto;
  padding: 24px 28px 28px;
}

.settings-overlay-enter-active,
.settings-overlay-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.settings-overlay-enter-from,
.settings-overlay-leave-to {
  opacity: 0;
}

.settings-overlay-enter-from .settings-dialog,
.settings-overlay-leave-to .settings-dialog {
  transform: translateY(12px) scale(0.99);
}
</style>
