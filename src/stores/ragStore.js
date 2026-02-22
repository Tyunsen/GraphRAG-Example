import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useGraphStore } from './graphStore'
import { fetchMessages, postMessage, clearMessagesApi } from '@/services/apiClient'

export const useRagStore = defineStore('rag', () => {
  const graphStore = useGraphStore()

  const messages = ref([])
  const isLoading = ref(false)
  const lastContext = ref(null)

  async function addMessage(role, content, context = null) {
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      role,
      content,
      context,
      timestamp: Date.now()
    }
    messages.value.push(msg)

    // Persist to backend
    const graphId = graphStore.currentGraphId
    if (graphId) {
      try {
        await postMessage(graphId, msg)
      } catch (e) {
        console.warn('[ragStore] Failed to save message to backend:', e.message)
      }
    }
  }

  function setLoading(val) {
    isLoading.value = val
  }

  function setLastContext(ctx) {
    lastContext.value = ctx
  }

  async function clearMessages() {
    messages.value = []
    lastContext.value = null

    const graphId = graphStore.currentGraphId
    if (graphId) {
      try {
        await clearMessagesApi(graphId)
      } catch (e) {
        console.warn('[ragStore] Failed to clear messages in backend:', e.message)
      }
    }
  }

  // ── Load messages from backend ────────────────────────────

  async function loadMessages(graphId) {
    if (!graphId) {
      messages.value = []
      lastContext.value = null
      return
    }
    try {
      const data = await fetchMessages(graphId)
      messages.value = data || []
    } catch (e) {
      console.warn('[ragStore] Failed to load messages:', e.message)
      messages.value = []
    }
    lastContext.value = null
  }

  // React to graph switching — load messages for the new graph
  watch(() => graphStore.currentGraphId, (newId) => {
    loadMessages(newId)
  })

  // Init: load messages for the graph that was restored on startup
  if (graphStore.currentGraphId) {
    loadMessages(graphStore.currentGraphId)
  }

  return {
    messages, isLoading, lastContext,
    addMessage, setLoading, setLastContext, clearMessages
  }
})
