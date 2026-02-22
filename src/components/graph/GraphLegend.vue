<template>
  <div class="graph-legend" v-if="types.size > 0">
    <div class="graph-legend-item" v-for="t in typeList" :key="t">
      <span class="graph-legend-dot" :style="{ background: getColor(t) }"></span>
      <span>{{ t }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getColorForType } from '@/utils/colorScale'

const props = defineProps({
  types: { type: Set, default: () => new Set() }
})

const typeList = computed(() => Array.from(props.types))

function getColor(type) {
  return getColorForType(type)
}
</script>
