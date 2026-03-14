<template>
  <header class="app-header">
    <h1 class="header-title">
      <router-link to="/">图谱工作台</router-link>
    </h1>
  </header>
</template>

<script setup>
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

.header-title {
  font-size: 14px;
  font-weight: 700;
}

.header-title a {
  color: var(--color-text);
}
</style>
