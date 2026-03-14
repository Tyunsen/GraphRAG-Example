<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="header-title">
        <router-link to="/">图谱工作台</router-link>
      </h1>
      <div class="header-meta">
        <span class="header-workspace" v-if="graphStore.currentGraphName">{{ graphStore.currentGraphName }}</span>
        <span class="header-stats" v-if="graphStore.nodeCount > 0">
          {{ graphStore.nodeCount }} 节点 · {{ graphStore.edgeCount }} 关系
        </span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useGraphStore } from '@/stores/graphStore'

const graphStore = useGraphStore()
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-title {
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}
.header-title a {
  color: var(--color-text);
}
.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.header-workspace {
  font-size: 12px;
  color: var(--color-text-secondary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-stats {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 2px 10px;
  background: var(--color-bg-input);
  border-radius: 10px;
}
</style>
