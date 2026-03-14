<template>
  <div class="settings-panel">
    <div class="settings-panel-header">
      <h3>模型</h3>
      <p>配置接口地址、模型名称与问答检索参数。</p>
    </div>

    <div class="settings-card">
      <div class="form-group">
        <label class="label">API 端点</label>
        <input class="input" v-model="settings.apiEndpoint" placeholder="https://api.example.com/v1" />
        <span class="hint">支持填写 base URL，例如 `https://host/v1`。</span>
      </div>

      <div class="form-group">
        <label class="label">API Key</label>
        <input class="input" type="password" v-model="settings.apiKey" placeholder="sk-..." />
      </div>

      <div class="form-group">
        <label class="label">模型名称</label>
        <input class="input" v-model="settings.modelName" placeholder="留空时按接口自动识别" />
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
    </div>

    <div class="settings-card">
      <div class="card-title">检索</div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">图谱扩展深度</label>
          <input class="input" type="number" min="1" max="5" v-model.number="settings.bfsDepth" />
        </div>
        <div class="form-group">
          <label class="label">最大节点数</label>
          <input class="input" type="number" min="10" max="200" v-model.number="settings.bfsMaxNodes" />
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="settings.resetDefaults()">恢复默认</button>
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

.form-group {
  margin-bottom: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
