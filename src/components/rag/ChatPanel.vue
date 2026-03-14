<template>
  <div class="chat-panel">
    <div class="chat-thread-header">
      <div>
        <div class="chat-thread-title">{{ ragStore.currentSession?.title || '当前会话' }}</div>
        <div class="chat-thread-subtitle">围绕当前工作区继续提问。</div>
      </div>
      <button
        v-if="ragStore.messages.length > 0"
        class="clear-thread-btn"
        @click="ragStore.clearMessages()"
      >清空</button>
    </div>

    <div class="chat-thread-card">
      <div class="chat-messages" ref="messagesRef">
        <div v-if="ragStore.messages.length === 0" class="chat-empty">
          <p>这个会话还没有内容</p>
          <p class="text-muted">输入问题后，系统会基于当前工作区的文件和图谱来回答。</p>
        </div>
        <ChatMessage
          v-for="msg in ragStore.messages"
          :key="msg.id"
          :msg="msg"
          :active="ragStore.activeMessageId === msg.id"
          @select="ragStore.selectMessage"
        />
        <div v-if="ragStore.isLoading" class="chat-loading">
          <span class="loading-dots">检索与生成中...</span>
        </div>
      </div>

      <div class="chat-input-area">
        <textarea
          class="input chat-input"
          v-model="inputText"
          rows="3"
          placeholder="输入问题，例如：油价为什么上升了？"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="ragStore.isLoading || !graphStore.currentGraphId"
        ></textarea>
        <button class="btn btn-primary send-btn" @click="sendMessage" :disabled="!inputText.trim() || ragStore.isLoading">发送</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'
import { useRagQuery } from '@/composables/useRagQuery'
import ChatMessage from './ChatMessage.vue'

const graphStore = useGraphStore()
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
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  })
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}
.chat-thread-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.chat-thread-title {
  font-size: 15px;
  font-weight: 700;
}
.chat-thread-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.clear-thread-btn {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}
.chat-thread-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}
.chat-empty {
  text-align: center;
  padding: 48px 12px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.text-muted {
  font-size: 12px;
  margin-top: 4px;
}
.chat-loading {
  padding: 8px 0;
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
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--color-border-light);
}
.chat-input {
  resize: vertical;
  min-height: 92px;
}
.send-btn {
  align-self: flex-end;
}
</style>
