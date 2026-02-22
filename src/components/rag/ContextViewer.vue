<template>
  <div class="context-viewer" v-if="context">
    <div class="context-header" @click="expanded = !expanded">
      <span class="context-toggle">{{ expanded ? '▼' : '▶' }}</span>
      <span>检索上下文 ({{ context.subgraph.nodes.length }} 节点, {{ context.subgraph.edges.length }} 关系)</span>
    </div>
    <div class="context-body" v-if="expanded">
      <div class="context-keywords">
        <span class="context-keyword" v-for="kw in context.keywords" :key="kw">{{ kw }}</span>
      </div>
      <pre class="context-text">{{ context.text }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  context: { type: Object, default: null }
})

const expanded = ref(false)
</script>

<style scoped>
.context-viewer {
  background: var(--color-bg);
  border-radius: var(--radius-md);
  margin-top: 6px;
  overflow: hidden;
}
.context-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.context-header:hover {
  background: var(--color-bg-hover);
}
.context-toggle {
  font-size: 10px;
}
.context-body {
  padding: 8px 10px;
  border-top: 1px solid var(--color-border-light);
}
.context-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.context-keyword {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--color-primary);
  color: #fff;
}
.context-text {
  font-size: 11px;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
