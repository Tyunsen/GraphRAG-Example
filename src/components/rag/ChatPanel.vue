<template>
  <div class="chat-panel">
    <div v-if="displayTitle" class="chat-thread-header">
      <div class="chat-thread-title">{{ displayTitle }}</div>
    </div>

    <div class="chat-thread-body">
      <div class="chat-messages" :class="{ empty: ragStore.messages.length === 0 }" ref="messagesRef">
        <ChatMessage
          v-for="msg in ragStore.messages"
          :key="msg.id"
          :msg="msg"
          :active="ragStore.activeMessageId === msg.id"
          @select="ragStore.selectMessage"
          @focus-evidence="focusEvidenceFromMessage"
        />

        <div v-if="ragStore.isLoading" class="chat-loading">
          <span class="loading-dots">检索与生成中...</span>
        </div>
      </div>
    </div>

    <div class="chat-input-shell">
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

const PLACEHOLDER_TITLES = new Set(['默认会话', '新会话', '开始对话', '未命名对话'])

const graphStore = useGraphStore()
const ragStore = useRagStore()
const { askQuestion } = useRagQuery()

const inputText = ref('')
const inputRef = ref(null)
const messagesRef = ref(null)

const displayTitle = computed(() => {
  const title = ragStore.currentSession?.title?.trim()
  if (!title || PLACEHOLDER_TITLES.has(title)) return ''
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

function focusEvidenceFromMessage(payload) {
  if (!payload?.evidence) return
  if (payload.messageId && ragStore.activeMessageId !== payload.messageId) {
    ragStore.selectMessage(payload.messageId)
  }
  graphStore.focusEvidenceItem(payload.evidence)
}

watch(
  () => ragStore.messages.length,
  () => {
    nextTick(() => {
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      resizeInput()
    })
  },
  { immediate: true }
)

watch(inputText, () => {
  nextTick(() => resizeInput())
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: #fff;
  border-radius: 0;
  border: none;
  overflow: hidden;
}

.chat-thread-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 8px;
}

.chat-thread-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}

.chat-thread-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.chat-messages.empty {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
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

.chat-input-shell {
  position: sticky;
  bottom: 0;
  padding: 12px 24px 20px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}

.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: none;
}

.chat-input {
  flex: 1;
  resize: none;
  min-height: 56px;
  max-height: 180px;
  line-height: 1.6;
  overflow-y: auto;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.send-btn {
  align-self: flex-end;
  min-width: 72px;
}
</style>
