<template>
  <header class="app-header">
    <div class="header-left">
      <h1 class="header-title">
        <router-link to="/">知识图谱</router-link>
      </h1>
      <span class="header-stats" v-if="graphStore.nodeCount > 0">
        {{ graphStore.nodeCount }} 节点 · {{ graphStore.edgeCount }} 关系
      </span>
    </div>
    <nav class="header-nav">
      <router-link to="/" class="nav-link" active-class="active">图谱</router-link>
      <router-link to="/settings" class="nav-link" active-class="active">设置</router-link>
    </nav>
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
  justify-content: space-between;
  padding: 0 20px;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-title {
  font-size: 16px;
  font-weight: 700;
}
.header-title a {
  color: var(--color-text);
}
.header-stats {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 2px 10px;
  background: var(--color-bg-input);
  border-radius: 10px;
}
.header-nav {
  display: flex;
  gap: 4px;
}
.nav-link {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: all 0.15s;
}
.nav-link:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.nav-link.active {
  background: var(--color-primary);
  color: #fff;
}
</style>
