<template>
  <div class="graph-controls">
    <div class="controls-strip">
      <div class="controls-group">
        <button
          v-for="item in modeOptions"
          :key="item.value"
          class="control-btn control-btn-filter"
          :class="{ active: viewMode === item.value }"
          type="button"
          @click="$emit('mode', item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="controls-divider"></div>

      <div class="controls-group">
        <button class="control-btn" type="button" @click="$emit('zoom-in')">放大</button>
        <button class="control-btn" type="button" @click="$emit('zoom-out')">缩小</button>
        <button class="control-btn" type="button" @click="$emit('reset')">重置</button>
        <button class="control-btn" type="button" @click="$emit('fit')">适配</button>
      </div>

      <div class="controls-divider"></div>

      <div class="controls-group">
        <button
          v-for="item in layoutOptions"
          :key="item.value"
          class="control-btn"
          :class="{ active: currentLayout === item.value }"
          type="button"
          @click="$emit('layout', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentLayout: { type: String, default: 'force' },
  viewMode: { type: String, default: 'event' }
})

defineEmits(['zoom-in', 'zoom-out', 'reset', 'fit', 'layout', 'mode'])

const modeOptions = [
  { value: 'event', label: '事件' },
  { value: 'entity', label: '实体' },
  { value: 'all', label: '全部' }
]

const layoutOptions = [
  { value: 'force', label: '力导' },
  { value: 'circular', label: '环形' },
  { value: 'grid', label: '网格' },
  { value: 'concentric', label: '同心圆' }
]
</script>

<style scoped>
.graph-controls {
  position: absolute;
  bottom: 14px;
  left: 14px;
  z-index: 10;
  pointer-events: none;
}

.controls-strip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 28px);
  flex-wrap: wrap;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  pointer-events: auto;
}

.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.controls-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.controls-divider {
  width: 1px;
  align-self: stretch;
  background: rgba(203, 213, 225, 0.9);
}

.control-btn {
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(203, 213, 225, 0.9);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.control-btn:hover {
  background: rgba(241, 245, 249, 0.98);
}

.control-btn-filter {
  min-width: 44px;
}

.control-btn.active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
</style>
