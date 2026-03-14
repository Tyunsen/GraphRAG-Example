<template>
  <div class="graph-view" ref="viewRef">
    <div class="graph-sidebar-shell" :style="{ width: `${sidebarWidth}px` }">
      <AppSidebar />
    </div>
    <div
      class="graph-splitter"
      :class="{ dragging: isDragging }"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整左侧面板宽度"
      @pointerdown="startResize"
    ></div>
    <div class="graph-main">
      <GraphCanvas />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'

const STORAGE_KEY = 'graph-view-sidebar-width'
const DEFAULT_SIDEBAR_WIDTH = 380
const MIN_SIDEBAR_WIDTH = 320
const MIN_GRAPH_WIDTH = 440
const SPLITTER_WIDTH = 12

const viewRef = ref(null)
const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH)
const isDragging = ref(false)

const maxSidebarWidth = computed(() => {
  const containerWidth = viewRef.value?.clientWidth || window.innerWidth || (DEFAULT_SIDEBAR_WIDTH + MIN_GRAPH_WIDTH + SPLITTER_WIDTH)
  return Math.max(MIN_SIDEBAR_WIDTH, containerWidth - MIN_GRAPH_WIDTH - SPLITTER_WIDTH)
})

function clampWidth(width) {
  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), maxSidebarWidth.value)
}

function saveWidth(width) {
  localStorage.setItem(STORAGE_KEY, String(width))
}

function applyStoredWidth() {
  const storedWidth = Number(localStorage.getItem(STORAGE_KEY))
  if (!Number.isFinite(storedWidth)) {
    sidebarWidth.value = clampWidth(DEFAULT_SIDEBAR_WIDTH)
    return
  }
  sidebarWidth.value = clampWidth(storedWidth)
}

function stopResize() {
  if (isDragging.value) saveWidth(sidebarWidth.value)
  isDragging.value = false
  document.body.classList.remove('resizing-layout')
  window.removeEventListener('pointermove', handleResize)
  window.removeEventListener('pointerup', stopResize)
}

function handleResize(event) {
  if (!isDragging.value) return
  sidebarWidth.value = clampWidth(event.clientX)
}

function startResize(event) {
  if (window.innerWidth <= 900) return
  isDragging.value = true
  document.body.classList.add('resizing-layout')
  window.addEventListener('pointermove', handleResize)
  window.addEventListener('pointerup', stopResize)
  handleResize(event)
}

function syncOnResize() {
  sidebarWidth.value = clampWidth(sidebarWidth.value)
  saveWidth(sidebarWidth.value)
}

onMounted(() => {
  applyStoredWidth()
  window.addEventListener('resize', syncOnResize)
})

onBeforeUnmount(() => {
  saveWidth(sidebarWidth.value)
  stopResize()
  window.removeEventListener('resize', syncOnResize)
})
</script>

<style scoped>
.graph-view {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}
.graph-sidebar-shell {
  height: 100%;
  min-width: 0;
  flex: 0 0 auto;
}
.graph-splitter {
  width: 12px;
  flex: 0 0 12px;
  position: relative;
  cursor: col-resize;
  background:
    linear-gradient(
      90deg,
      transparent 0,
      transparent calc(50% - 1px),
      rgba(79, 109, 245, 0.14) calc(50% - 1px),
      rgba(79, 109, 245, 0.14) calc(50% + 1px),
      transparent calc(50% + 1px),
      transparent 100%
    );
  transition: background-color 0.15s ease;
}
.graph-splitter::after {
  content: '';
  position: absolute;
  inset: 18px 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(79, 109, 245, 0.22), rgba(79, 109, 245, 0.08));
  opacity: 0;
  transition: opacity 0.15s ease;
}
.graph-splitter:hover::after,
.graph-splitter.dragging::after {
  opacity: 1;
}
.graph-main {
  flex: 1;
  overflow: hidden;
  min-width: 440px;
}

@media (max-width: 900px) {
  .graph-sidebar-shell {
    width: min(100vw, 380px) !important;
  }

  .graph-splitter {
    display: none;
  }
}
</style>
