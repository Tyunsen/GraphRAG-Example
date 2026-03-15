<template>
  <div class="chat-message" :class="[msg.role, { active }]" @click="$emit('select', msg.id)">
    <div class="msg-bubble">
      <div class="msg-content">{{ msg.content }}</div>
      <ContextViewer
        v-if="msg.context"
        :context="msg.context"
        @focus-evidence="$emit('focus-evidence', { messageId: msg.id, evidence: $event })"
        @preview-evidence="$emit('preview-evidence', { messageId: msg.id, evidence: $event })"
      />
    </div>
    <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
  </div>
</template>

<script setup>
import ContextViewer from './ContextViewer.vue'

defineProps({
  msg: { type: Object, required: true },
  active: { type: Boolean, default: false }
})

defineEmits(['select', 'focus-evidence', 'preview-evidence'])

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.chat-message {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
  cursor: pointer;
  position: relative;
}

.chat-message::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 22px;
  width: 3px;
  border-radius: 999px;
  background: transparent;
  transition: background 0.15s ease;
}

.chat-message.user {
  align-items: flex-end;
}

.chat-message.user::before {
  right: -8px;
}

.chat-message.assistant {
  align-items: flex-start;
}

.chat-message.assistant::before {
  left: -8px;
}

.msg-bubble {
  max-width: 92%;
  padding: 12px 14px;
  border-radius: 18px;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, background 0.15s ease;
}

.user .msg-bubble {
  background: linear-gradient(180deg, rgba(79, 109, 245, 0.98), rgba(65, 95, 226, 0.98));
  color: #fff;
  border-bottom-right-radius: 8px;
}

.assistant .msg-bubble {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom-left-radius: 8px;
}

.chat-message.active::before {
  background: rgba(79, 109, 245, 0.96);
}

.chat-message.active .msg-bubble {
  box-shadow: 0 0 0 3px rgba(79, 109, 245, 0.16), 0 18px 32px rgba(79, 109, 245, 0.1);
  transform: translateY(-1px);
}

.assistant.active .msg-bubble {
  border-color: rgba(79, 109, 245, 0.36);
  background: rgba(248, 250, 255, 0.98);
}

.user.active .msg-bubble {
  box-shadow: 0 0 0 3px rgba(79, 109, 245, 0.22), 0 18px 32px rgba(15, 23, 42, 0.14);
}

.msg-time {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 4px;
  padding: 0 4px;
}
</style>
