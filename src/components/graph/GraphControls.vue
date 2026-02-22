<template>
  <div class="graph-controls">
    <div class="controls-group">
      <button @click="$emit('zoom-in')" title="放大">+</button>
      <button @click="$emit('zoom-out')" title="缩小">−</button>
      <button @click="$emit('reset')" title="重置视图">⌂</button>
      <button @click="$emit('fit')" title="适配视图">⊞</button>
    </div>
    <div class="controls-divider"></div>
    <div class="controls-group">
      <button
        :class="{ active: currentLayout === 'force' }"
        @click="$emit('layout', 'force')"
        title="力导向布局"
      >力</button>
      <button
        :class="{ active: currentLayout === 'circular' }"
        @click="$emit('layout', 'circular')"
        title="环形布局"
      >○</button>
      <button
        :class="{ active: currentLayout === 'grid' }"
        @click="$emit('layout', 'grid')"
        title="网格布局"
      >田</button>
      <button
        :class="{ active: currentLayout === 'concentric' }"
        @click="$emit('layout', 'concentric')"
        title="同心圆布局"
      >◎</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentLayout: { type: String, default: 'force' }
})
defineEmits(['zoom-in', 'zoom-out', 'reset', 'fit', 'layout'])
</script>

<style scoped>
.controls-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}
.controls-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
button.active {
  background: var(--color-primary) !important;
  color: #fff !important;
  border-color: var(--color-primary) !important;
}
</style>
