<template>
  <div class="chat-message" :class="msg.role">
    <div class="msg-bubble">
      <div class="msg-content">{{ msg.content }}</div>
      <ContextViewer v-if="msg.context" :context="msg.context" />
    </div>
    <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
  </div>
</template>

<script setup>
import ContextViewer from './ContextViewer.vue'

defineProps({
  msg: { type: Object, required: true }
})

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.chat-message {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}
.chat-message.user {
  align-items: flex-end;
}
.chat-message.assistant {
  align-items: flex-start;
}
.msg-bubble {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.user .msg-bubble {
  background: var(--color-primary);
  color: #fff;
  border-bottom-right-radius: var(--radius-sm);
}
.assistant .msg-bubble {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: var(--radius-sm);
}
.msg-time {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 3px;
  padding: 0 4px;
}
</style>
