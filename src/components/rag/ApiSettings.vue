<template>
  <div class="api-settings">
    <h4>模型配置</h4>
    <div class="form-group">
      <label class="label">API 端点</label>
      <input class="input" v-model="settings.apiEndpoint" placeholder="https://api.example.com/v1" />
      <span class="hint">填写 base URL 或完整地址均可，例如 `https://host/v1`</span>
    </div>

    <div class="form-group">
      <label class="label">API Key</label>
      <input class="input" type="password" v-model="settings.apiKey" placeholder="sk-..." />
    </div>

    <div class="form-group">
      <label class="label">模型名称</label>
      <input class="input" v-model="settings.modelName" placeholder="留空则按服务端默认模型处理" />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="label">Temperature</label>
        <input class="input" type="number" step="0.1" min="0" max="2" v-model.number="settings.temperature" />
      </div>
      <div class="form-group">
        <label class="label">Max Tokens</label>
        <input class="input" type="number" step="64" min="64" max="8192" v-model.number="settings.maxTokens" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="label">子图深度</label>
        <input class="input" type="number" min="1" max="5" v-model.number="settings.bfsDepth" />
      </div>
      <div class="form-group">
        <label class="label">最大节点数</label>
        <input class="input" type="number" min="10" max="200" v-model.number="settings.bfsMaxNodes" />
      </div>
    </div>

    <div class="toggle-row">
      <label class="toggle-label">
        <input type="checkbox" v-model="settings.useLLMExtraction" class="toggle-checkbox" />
        <span class="toggle-switch"></span>
        <span>启用模型抽取</span>
      </label>
      <span class="hint" v-if="!settings.isApiConfigured">需要先配置 API</span>
    </div>

    <p class="panel-copy">
      抽取提示词按工作区维度管理。请在“编辑工作区”里查看或修改当前工作区的抽取提示词。
    </p>

    <button class="btn btn-secondary btn-sm" @click="settings.resetDefaults()">恢复默认</button>
  </div>
</template>

<script setup>
import { useSettingsStore } from '@/stores/settingsStore'

const settings = useSettingsStore()
</script>

<style scoped>
.api-settings {
  padding: 4px 0;
}

.api-settings h4 {
  font-size: 13px;
  margin-bottom: 12px;
}

.form-group {
  margin-bottom: 10px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-row .form-group {
  flex: 1;
}

.hint {
  display: block;
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 3px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.toggle-checkbox {
  display: none;
}

.toggle-switch {
  position: relative;
  width: 34px;
  height: 18px;
  background: var(--color-border);
  border-radius: 9px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
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

.panel-copy {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-bottom: 12px;
}
</style>
