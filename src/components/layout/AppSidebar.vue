<template>
  <aside class="app-sidebar">
    <div class="sidebar-tabs">
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'graphs' }"
        @click="activeTab = 'graphs'"
      >图谱</button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'import' }"
        @click="activeTab = 'import'"
      >导入</button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
      >问答</button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'api' }"
        @click="activeTab = 'api'"
      >API</button>
    </div>
    <div class="sidebar-content">
      <div v-show="activeTab === 'graphs'" class="tab-panel">
        <GraphList />
      </div>
      <div v-show="activeTab === 'import'" class="tab-panel">
        <FileImporter @files-selected="onFilesSelected" />

        <div v-if="extracting" class="extracting-msg">
          <span class="extracting-spinner"></span>
          AI 正在分析文档，提取实体和关系...
        </div>
        <div v-else-if="parsing" class="parsing-msg">
          正在解析文件...
        </div>
        <div v-if="parseError" class="error-msg">{{ parseError }}</div>

        <ImportPreview
          :result="lastResult"
          @confirm="confirmImport"
          @cancel="cancelImport"
        />
        <ImportHistory />
      </div>
      <div v-show="activeTab === 'chat'" class="tab-panel tab-panel-chat">
        <ChatPanel />
      </div>
      <div v-show="activeTab === 'api'" class="tab-panel">
        <ApiSettings />
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useFileParser } from '@/composables/useFileParser'
import GraphList from '@/components/import/GraphList.vue'
import FileImporter from '@/components/import/FileImporter.vue'
import ImportPreview from '@/components/import/ImportPreview.vue'
import ImportHistory from '@/components/import/ImportHistory.vue'
import ChatPanel from '@/components/rag/ChatPanel.vue'
import ApiSettings from '@/components/rag/ApiSettings.vue'

const activeTab = ref('graphs')
const { parsing, extracting, parseError, lastResult, parseFile, confirmImport, cancelImport } = useFileParser()

async function onFilesSelected(files) {
  for (const file of files) {
    try {
      await parseFile(file)
    } catch (e) {
      // Error is already stored in parseError
    }
  }
}
</script>

<style scoped>
.app-sidebar {
  width: var(--sidebar-width);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
}
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  padding: 0 8px;
}
.sidebar-tab {
  flex: 1;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.sidebar-tab:hover {
  color: var(--color-text);
}
.sidebar-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
.sidebar-content {
  flex: 1;
  overflow: hidden;
}
.tab-panel {
  height: 100%;
  padding: 14px;
  overflow-y: auto;
}
.tab-panel-chat {
  display: flex;
  flex-direction: column;
}
.error-msg {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: 12px;
}
.extracting-msg {
  margin-top: 8px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.extracting-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-primary-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.parsing-msg {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
