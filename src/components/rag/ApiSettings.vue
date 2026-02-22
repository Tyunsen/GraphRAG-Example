<template>
  <div class="api-settings">
    <h4>API 配置</h4>
    <div class="form-group">
      <label class="label">API 端点</label>
      <input class="input" v-model="settings.apiEndpoint" placeholder="https://api.example.com/v1" />
      <span class="hint">填写 base URL 或完整地址均可，如 https://host/v1</span>
    </div>
    <div class="form-group">
      <label class="label">API Key</label>
      <input class="input" type="password" v-model="settings.apiKey" placeholder="sk-..." />
    </div>
    <div class="form-group">
      <label class="label">模型名称</label>
      <input class="input" v-model="settings.modelName" placeholder="留空自动识别 (deepseek-chat / gpt-3.5-turbo ...)" />
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
        <label class="label">BFS 深度</label>
        <input class="input" type="number" min="1" max="5" v-model.number="settings.bfsDepth" />
      </div>
      <div class="form-group">
        <label class="label">最大节点数</label>
        <input class="input" type="number" min="10" max="200" v-model.number="settings.bfsMaxNodes" />
      </div>
    </div>
    <button class="btn btn-secondary btn-sm" @click="settings.resetDefaults()">恢复默认</button>

    <!-- LLM Extraction Config -->
    <div class="extraction-section">
      <h4>智能提取配置</h4>
      <div class="toggle-row">
        <label class="toggle-label">
          <input
            type="checkbox"
            v-model="settings.useLLMExtraction"
            class="toggle-checkbox"
          />
          <span class="toggle-switch"></span>
          <span>启用 LLM 智能提取</span>
        </label>
        <span class="hint" v-if="!settings.isApiConfigured">需先配置 API</span>
      </div>
      <p class="extraction-desc">
        对非结构化文档（TXT/MD/PDF）使用大语言模型提取实体和关系。
        JSON/CSV 文件始终使用结构化解析。未配置 API 时自动回退为正则提取。
      </p>

      <div class="prompt-section" v-if="settings.useLLMExtraction">
        <div class="prompt-header" @click="promptExpanded = !promptExpanded">
          <span class="prompt-toggle">{{ promptExpanded ? '▼' : '▶' }}</span>
          <label class="label" style="margin-bottom:0;cursor:pointer">自定义提取提示词</label>
        </div>
        <div v-if="promptExpanded" class="prompt-body">
          <textarea
            class="input prompt-textarea"
            v-model="settings.extractionPrompt"
            rows="10"
            placeholder="输入自定义提取提示词..."
          ></textarea>
          <button
            class="btn btn-secondary btn-sm"
            @click="settings.resetExtractionPrompt()"
          >恢复默认提示词</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settingsStore'
const settings = useSettingsStore()
const promptExpanded = ref(false)
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

/* Extraction section */
.extraction-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-light);
}
.extraction-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 10px;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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

/* Prompt section */
.prompt-section {
  margin-top: 8px;
}
.prompt-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}
.prompt-header:hover .label {
  color: var(--color-text);
}
.prompt-toggle {
  font-size: 10px;
  color: var(--color-text-secondary);
}
.prompt-body {
  margin-top: 6px;
}
.prompt-textarea {
  resize: vertical;
  min-height: 120px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 8px;
}
</style>
