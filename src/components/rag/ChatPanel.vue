<template>
  <div class="chat-panel">
    <div class="session-toolbar">
      <div class="session-title">会话</div>
      <button class="btn btn-sm btn-primary" @click="ragStore.createSession()">新建</button>
    </div>

    <div class="session-list" v-if="ragStore.sessions.length > 0">
      <button
        v-for="session in ragStore.sessions"
        :key="session.id"
        class="session-chip"
        :class="{ active: ragStore.currentSessionId === session.id }"
        @click="ragStore.switchSession(session.id)"
      >
        {{ session.title }}
      </button>
    </div>

    <div class="chat-messages" ref="messagesRef">
      <div v-if="ragStore.messages.length === 0" class="chat-empty">
        <p>围绕当前工作区做证据优先问答</p>
        <p class="text-muted">进入会话默认展示完整图谱，点击某条问题后聚焦它对应的证据子图。</p>
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
      <input
        class="input chat-input"
        v-model="inputText"
        placeholder="输入问题..."
        @keydown.enter="sendMessage"
        :disabled="ragStore.isLoading || !graphStore.currentGraphId"
      />
      <button class="btn btn-primary" @click="sendMessage" :disabled="!inputText.trim() || ragStore.isLoading">发送</button>
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
  height: 100%;
}
.session-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.session-title {
  font-size: 12px;
  font-weight: 600;
}
.session-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.session-chip {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-secondary);
}
.session-chip.active {
  background: rgba(79, 109, 245, 0.1);
  border-color: var(--color-primary);
  color: var(--color-primary);
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
.text-muted {
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
