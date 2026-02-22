<template>
  <div class="graph-container" ref="containerRef">
    <svg ref="svgRef">
      <g ref="graphGroupRef"></g>
    </svg>

    <GraphControls
      :current-layout="forceGraph.currentLayout.value"
      @zoom-in="forceGraph.zoomIn()"
      @zoom-out="forceGraph.zoomOut()"
      @reset="forceGraph.resetZoom()"
      @fit="forceGraph.fitToView()"
      @layout="forceGraph.setLayout($event)"
    />

    <GraphLegend :types="graphStore.typeSet" />

    <NodeTooltip
      v-if="forceGraph.hoveredNode.value"
      :node="forceGraph.hoveredNode.value"
      :x="forceGraph.tooltipX.value"
      :y="forceGraph.tooltipY.value"
      :degree="graphStore.getNodeDegree(forceGraph.hoveredNode.value.id)"
    />

    <div v-if="graphStore.nodeCount === 0" class="graph-empty">
      <div class="graph-empty-icon">📊</div>
      <p>暂无图谱数据</p>
      <p class="text-muted">请从左侧导入文件构建知识图谱</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useForceGraph } from '@/composables/useForceGraph'
import GraphControls from './GraphControls.vue'
import GraphLegend from './GraphLegend.vue'
import NodeTooltip from './NodeTooltip.vue'

const graphStore = useGraphStore()
const containerRef = ref(null)
const svgRef = ref(null)
const graphGroupRef = ref(null)

const forceGraph = useForceGraph(graphStore)

let resizeObserver = null

onMounted(() => {
  forceGraph.init(containerRef.value, svgRef.value, graphGroupRef.value)

  if (graphStore.nodeCount > 0) {
    forceGraph.update()
  }

  resizeObserver = new ResizeObserver(() => {
    // Dimensions are recalculated on next update()
  })
  resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
})

// Primary trigger: graphVersion increments on any data mutation
watch(() => graphStore.graphVersion, () => {
  nextTick(() => forceGraph.update())
})

// Secondary trigger: when currentGraphId changes (covers async loadGraph)
watch(() => graphStore.currentGraphId, () => {
  nextTick(() => {
    if (graphStore.nodeCount > 0) {
      forceGraph.update()
    }
  })
})

watch(() => graphStore.highlightedNodes.size, () => {
  forceGraph.updateHighlights()
})
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--color-bg);
}
.graph-container svg {
  width: 100%;
  height: 100%;
  display: block;
}
.graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
}
.graph-empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.text-muted {
  font-size: 12px;
  margin-top: 4px;
}
</style>
