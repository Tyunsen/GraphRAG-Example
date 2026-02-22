<template>
  <div class="node-tooltip" :style="{ left: x + 'px', top: y + 'px' }">
    <h4>{{ node.label }}</h4>
    <span class="type-badge" :style="{ background: typeColor }">{{ node.type }}</span>
    <div class="prop-row">
      <span class="prop-key">连接数</span>
      <span>{{ degree }}</span>
    </div>
    <div class="prop-row" v-for="(val, key) in node.properties" :key="key">
      <span class="prop-key">{{ key }}</span>
      <span>{{ val }}</span>
    </div>
    <div class="prop-row" v-if="node.sourceFile">
      <span class="prop-key">来源</span>
      <span>{{ node.sourceFile }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getColorForType } from '@/utils/colorScale'

const props = defineProps({
  node: { type: Object, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  degree: { type: Number, default: 0 }
})

const typeColor = computed(() => getColorForType(props.node.type))
</script>
