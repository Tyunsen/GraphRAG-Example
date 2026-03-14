<template>
  <div v-if="context" class="context-viewer">
    <div class="context-header" @click="expanded = !expanded">
      <span class="context-toggle">{{ expanded ? '▼' : '▶' }}</span>
      <span>证据来源 ({{ context.evidence?.length || 0 }} 段, {{ context.subgraph?.nodes?.length || 0 }} 节点)</span>
    </div>

    <div v-if="expanded" class="context-body">
      <div v-if="context.evidence?.length" class="evidence-list">
        <div v-for="item in context.evidence" :key="item.chunkId" class="evidence-item">
          <div class="evidence-meta">{{ item.fileName }} 第{{ item.paragraphIndex }}段</div>
          <div class="evidence-text">{{ item.text }}</div>
          <div class="evidence-tags">
            <span
              v-for="label in filterDisplayableLabels(item.linkedNodes || [])"
              :key="`${item.chunkId}-${label}`"
              class="evidence-tag"
            >
              {{ label }}
            </span>
            <span
              v-for="label in filterDisplayableLabels(item.linkedEvents || [])"
              :key="`${item.chunkId}-event-${label}`"
              class="evidence-tag evidence-tag-event"
            >
              {{ label }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { filterDisplayableLabels } from '@/utils/graphLabelFilter'

defineProps({
  context: { type: Object, default: null }
})

const expanded = ref(false)
</script>

<style scoped>
.context-viewer {
  margin-top: 6px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.context-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}

.context-header:hover {
  background: var(--color-bg-hover);
}

.context-toggle {
  font-size: 10px;
}

.context-body {
  padding: 8px 10px;
  border-top: 1px solid var(--color-border-light);
}

.evidence-list {
  display: grid;
  gap: 8px;
}

.evidence-item {
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
}

.evidence-meta {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
}

.evidence-text {
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

.evidence-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.evidence-tag {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 10px;
}

.evidence-tag-event {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}
</style>
