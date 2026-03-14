<template>
  <div class="chat-panel">
    <div class="chat-thread-header">
      <div class="chat-thread-title">{{ displayTitle }}</div>
      <button
        v-if="ragStore.messages.length > 0"
        class="clear-thread-btn"
        @click="ragStore.clearMessages()"
      >
        清空
      </button>
    </div>

    <div class="chat-thread-card">
      <div class="chat-messages" ref="messagesRef">
        <div v-if="ragStore.messages.length === 0" class="chat-empty">
          <p>开始提问。</p>
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
          ref="inputRef"
          class="input chat-input"
          v-model="inputText"
          rows="1"
          placeholder="输入问题，例如：油价为什么上升了？"
          @input="resizeInput"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="ragStore.isLoading || !graphStore.currentGraphId"
        ></textarea>
        <button
          class="btn btn-primary send-btn"
          @click="sendMessage"
          :disabled="!inputText.trim() || ragStore.isLoading"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'
import { useRagQuery } from '@/composables/useRagQuery'
import ChatMessage from './ChatMessage.vue'

const PLACEHOLDER_TITLES = new Set(['默认会话', '新会话', '开始对话'])

const graphStore = useGraphStore()
const ragStore = useRagStore()
const { askQuestion } = useRagQuery()

const inputText = ref('')
const inputRef = ref(null)
const messagesRef = ref(null)

const displayTitle = computed(() => {
  const title = ragStore.currentSession?.title?.trim()
  if (!title || PLACEHOLDER_TITLES.has(title)) return '开始对话'
  return title
})

function resizeInput() {
  if (!inputRef.value) return
  inputRef.value.style.height = '0px'
  const nextHeight = Math.min(Math.max(inputRef.value.scrollHeight, 56), 180)
  inputRef.value.style.height = `${nextHeight}px`
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || ragStore.isLoading) return
  inputText.value = ''
  resizeInput()
  await askQuestion(text)
}

watch(() => ragStore.messages.length, () => {
  nextTick(() => {
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    resizeInput()
  })
}, { immediate: true })

watch(inputText, () => {
  nextTick(() => resizeInput())
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-thread-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
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
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 20px 18px;
}

.chat-empty {
  text-align: center;
  padding: 64px 12px;
  color: var(--color-text-muted);
  font-size: 14px;
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
  align-items: flex-end;
  gap: 12px;
  padding: 16px 18px 18px;
  border-top: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.94);
}

.chat-input {
  flex: 1;
  resize: none;
  min-height: 56px;
  max-height: 180px;
  line-height: 1.6;
  overflow-y: auto;
  border-radius: 16px;
}

.send-btn {
  align-self: flex-end;
  min-width: 72px;
}
</style>
