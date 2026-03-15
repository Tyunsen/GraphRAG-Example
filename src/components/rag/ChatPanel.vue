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
          :placeholder="inputPlaceholder"
          @input="resizeInput"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="ragStore.isLoading || !canSendMessage"
        ></textarea>
        <button
          class="btn btn-primary send-btn"
          @click="sendMessage"
          :disabled="!inputText.trim() || ragStore.isLoading || !canSendMessage"
        >
          发送
        </button>
      </div>
    </div>

    <transition name="evidence-preview">
      <div
        v-if="evidencePreview"
        class="evidence-preview-overlay"
        @click.self="closeEvidencePreview"
      >
        <div class="evidence-preview-card">
          <div class="evidence-preview-header">
            <div class="evidence-preview-meta">
              <div class="evidence-preview-title">原文段落</div>
              <div class="evidence-preview-subtitle">
                {{ evidencePreview.fileName || '未命名文件' }}
                <span v-if="Number.isInteger(evidencePreview.paragraphIndex)">
                  · 第 {{ evidencePreview.paragraphIndex + 1 }} 段
                </span>
              </div>
            </div>
            <button
              type="button"
              class="evidence-preview-close"
              @click="closeEvidencePreview"
            >
              关闭
            </button>
          </div>
          <div class="evidence-preview-content">
            {{ evidencePreview.text || '没有可显示的原文内容' }}
          </div>
        </div>
      </div>
    </transition>
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
const evidencePreview = ref(null)
const canSendMessage = computed(() => Boolean(graphStore.currentGraphId && ragStore.currentSessionId))
const inputPlaceholder = computed(() => {
  if (!graphStore.currentGraphId) return '先选择工作区'
  if (!ragStore.currentSessionId) return '先新建对话，再开始提问'
  return '输入问题，例如：油价为什么上升了？'
})

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
  if (!text || ragStore.isLoading || !canSendMessage.value) return
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
  evidencePreview.value = {
    fileName: payload.evidence.fileName,
    paragraphIndex: payload.evidence.paragraphIndex,
    text: payload.evidence.text
  }
}

function closeEvidencePreview() {
  evidencePreview.value = null
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

.evidence-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.36);
}

.evidence-preview-card {
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: min(78vh, 820px);
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.evidence-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.evidence-preview-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.evidence-preview-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.evidence-preview-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
  word-break: break-all;
}

.evidence-preview-close {
  flex-shrink: 0;
  min-width: 72px;
  padding: 8px 14px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text);
  cursor: pointer;
}

.evidence-preview-close:hover {
  background: rgba(241, 245, 249, 0.9);
}

.evidence-preview-content {
  padding: 20px 24px 24px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.9;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.evidence-preview-enter-active,
.evidence-preview-leave-active {
  transition: opacity 0.18s ease;
}

.evidence-preview-enter-active .evidence-preview-card,
.evidence-preview-leave-active .evidence-preview-card {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.evidence-preview-enter-from,
.evidence-preview-leave-to {
  opacity: 0;
}

.evidence-preview-enter-from .evidence-preview-card,
.evidence-preview-leave-to .evidence-preview-card {
  transform: translateY(8px);
  opacity: 0;
}
</style>
