<template>
  <div class="chat-panel">
    <div class="chat-messages" ref="messagesRef">
      <div v-if="ragStore.messages.length === 0" class="chat-empty">
        <p>基于知识图谱的智能问答</p>
        <p class="text-muted">输入问题，系统将从图谱中检索相关上下文</p>
      </div>
      <ChatMessage
        v-for="msg in ragStore.messages"
        :key="msg.id"
        :msg="msg"
      />
      <div v-if="ragStore.isLoading" class="chat-loading">
        <span class="loading-dots">思考中...</span>
      </div>
    </div>
    <div class="chat-input-area">
      <input
        class="input chat-input"
        v-model="inputText"
        placeholder="输入问题..."
        @keydown.enter="sendMessage"
        :disabled="ragStore.isLoading"
      />
      <button
        class="btn btn-primary"
        @click="sendMessage"
        :disabled="!inputText.trim() || ragStore.isLoading"
      >发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { useRagStore } from '@/stores/ragStore'
import { useRagQuery } from '@/composables/useRagQuery'
import ChatMessage from './ChatMessage.vue'

const ragStore = useRagStore()
const { askQuestion } = useRagQuery()

const inputText = ref('')
const messagesRef = ref(null)

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || ragStore.isLoading) return
  inputText.value = ''
  await askQuestion(text)
}

watch(() => ragStore.messages.length, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}
.chat-empty {
  text-align: center;
  padding: 30px 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.chat-empty .text-muted {
  font-size: 12px;
  margin-top: 4px;
}
.chat-loading {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.loading-dots {
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.chat-input-area {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-light);
}
.chat-input {
  flex: 1;
}
</style>
