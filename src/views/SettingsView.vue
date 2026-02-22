<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2>设置</h2>
      <ApiSettings />
      <div class="settings-section">
        <h4>关于</h4>
        <p class="text-muted">知识图谱应用 - 基于 Vue 3 + D3.js</p>
        <p class="text-muted">支持 JSON / CSV / TXT 文件导入，D3 力导向图可视化，以及基于 RAG 的知识问答。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import ApiSettings from '@/components/rag/ApiSettings.vue'
</script>

<style scoped>
.settings-view {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.settings-card {
  max-width: 600px;
  margin: 0 auto;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 24px;
}
.settings-card h2 {
  font-size: 18px;
  margin-bottom: 20px;
}
.settings-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-light);
}
.settings-section h4 {
  font-size: 13px;
  margin-bottom: 8px;
}
.text-muted {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
</style>
