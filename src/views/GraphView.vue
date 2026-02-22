<template>
  <div class="graph-view">
    <AppSidebar />
    <div class="graph-main">
      <GraphCanvas />
    </div>
  </div>
</template>

<script setup>
import AppSidebar from '@/components/layout/AppSidebar.vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'
</script>

<style scoped>
.graph-view {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.graph-main {
  flex: 1;
  overflow: hidden;
}
</style>
