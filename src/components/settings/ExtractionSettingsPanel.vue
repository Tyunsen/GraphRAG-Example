<template>
  <div class="settings-panel">
    <div class="settings-panel-header">
      <h3>抽取配置</h3>
      <p>这里只管理是否启用模型抽取。每个工作区自己的抽取提示词，在“新建 / 编辑工作区”里维护。</p>
    </div>

    <div class="settings-card">
      <div class="toggle-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="settings.useLLMExtraction" class="toggle-checkbox" />
          <span class="toggle-switch"></span>
          <span>启用模型抽取</span>
        </label>
        <span class="hint" v-if="!settings.isApiConfigured">需要先配置模型接口</span>
      </div>

      <p class="card-copy">
        `TXT / MD / PDF` 会按当前工作区的意图和抽取提示词调用模型抽取。`JSON / CSV` 仍然优先走结构化解析。
      </p>
    </div>

    <div class="settings-card">
      <div class="card-title">提示词管理方式</div>
      <p class="card-copy">
        工作区意图变化时，系统会基于意图自动生成一份默认抽取提示词。你也可以在编辑工作区时手动修改。
      </p>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settingsStore'

const settings = useSettingsStore()
</script>

<style scoped>
.settings-panel {
  display: grid;
  gap: 18px;
}

.settings-panel-header h3 {
  font-size: 22px;
  font-weight: 700;
}

.settings-panel-header p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.settings-card {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.card-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 700;
}

.card-copy {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.toggle-checkbox {
  display: none;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-border);
  border-radius: 999px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-checkbox:checked + .toggle-switch {
  background: var(--color-primary);
}

.toggle-checkbox:checked + .toggle-switch::after {
  transform: translateX(16px);
}

.hint {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
