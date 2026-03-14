import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useGraphStore } from './graphStore'
import {
  clearMessagesApi,
  createSessionApi,
  deleteSessionApi,
  fetchMessages,
  fetchSessions,
  postMessage,
  renameSessionApi
} from '@/services/apiClient'
import { generateId } from '@/utils/idGenerator'

const SESSION_STORAGE_KEY = 'zstp-current-session'

function loadStoredSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function persistStoredSession(workspaceId, sessionId) {
  const map = loadStoredSessions()
  if (workspaceId && sessionId) map[workspaceId] = sessionId
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map))
}

function clearStoredSession(workspaceId) {
  const map = loadStoredSessions()
  if (workspaceId && workspaceId in map) {
    delete map[workspaceId]
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map))
  }
}

export const useRagStore = defineStore('rag', () => {
  const graphStore = useGraphStore()

  const sessions = ref([])
  const currentSessionId = ref(null)
  const messages = ref([])
  const isLoading = ref(false)
  const lastContext = ref(null)
  const activeMessageId = ref(null)

  const currentSession = computed(() =>
    sessions.value.find(item => item.id === currentSessionId.value) || null
  )

  function resetGraphView() {
    activeMessageId.value = null
    graphStore.showFullGraph()
    graphStore.clearHighlights()
  }

  async function loadMessagesForSession(sessionId) {
    if (!sessionId) {
      messages.value = []
      lastContext.value = null
      resetGraphView()
      return
    }

    try {
      messages.value = await fetchMessages(sessionId)
    } catch (error) {
      console.warn('[ragStore] failed to load messages:', error.message)
      messages.value = []
    }

    lastContext.value = null
    resetGraphView()
  }

  function resolveContextForMessage(messageId) {
    const index = messages.value.findIndex(item => item.id === messageId)
    if (index === -1) return null

    const current = messages.value[index]
    if (current?.context) return current.context

    if (current?.role === 'user') {
      return messages.value
        .slice(index + 1)
        .find(item => item.role === 'assistant' && item.context)?.context || null
    }

    return null
  }

  function selectMessage(messageId) {
    activeMessageId.value = messageId
    const context = resolveContextForMessage(messageId)

    if (!context?.subgraph?.nodes?.length) {
      graphStore.showFullGraph()
      graphStore.clearHighlights()
      return
    }

    graphStore.focusSubgraph(context.subgraph)
    graphStore.setHighlightedNodes(
      context.nodeIds?.length
        ? context.nodeIds
        : context.subgraph.nodes.map(node => node.id)
    )
  }

  async function loadSessionsForWorkspace(graphId) {
    if (!graphId) {
      sessions.value = []
      currentSessionId.value = null
      messages.value = []
      clearStoredSession(graphId)
      resetGraphView()
      return
    }

    try {
      sessions.value = await fetchSessions(graphId)

      const stored = loadStoredSessions()[graphId]
      currentSessionId.value = sessions.value.some(item => item.id === stored)
        ? stored
        : sessions.value[0]?.id || null

      if (currentSessionId.value) persistStoredSession(graphId, currentSessionId.value)
      else clearStoredSession(graphId)

      await loadMessagesForSession(currentSessionId.value)
    } catch (error) {
      console.warn('[ragStore] failed to load sessions:', error.message)
      sessions.value = []
      currentSessionId.value = null
      messages.value = []
      resetGraphView()
    }
  }

  async function createSession(title = '新对话') {
    const graphId = graphStore.currentGraphId
    if (!graphId) return null

    const id = generateId('s')
    await createSessionApi(graphId, { id, title })
    sessions.value = await fetchSessions(graphId)
    currentSessionId.value = id
    persistStoredSession(graphId, id)
    messages.value = []
    lastContext.value = null
    resetGraphView()
    return id
  }

  async function ensureActiveSession() {
    if (currentSessionId.value) return currentSessionId.value
    return createSession('新对话')
  }

  async function switchSession(sessionId) {
    if (!sessionId || currentSessionId.value === sessionId) return
    currentSessionId.value = sessionId
    persistStoredSession(graphStore.currentGraphId, sessionId)
    await loadMessagesForSession(sessionId)
  }

  async function renameSession(sessionId, title) {
    const nextTitle = title.trim()
    if (!nextTitle) return

    await renameSessionApi(sessionId, nextTitle)
    const target = sessions.value.find(item => item.id === sessionId)
    if (target) target.title = nextTitle
  }

  async function deleteSession(sessionId) {
    const graphId = graphStore.currentGraphId
    await deleteSessionApi(sessionId)
    sessions.value = sessions.value.filter(item => item.id !== sessionId)

    if (currentSessionId.value === sessionId) {
      currentSessionId.value = sessions.value[0]?.id || null
      if (currentSessionId.value) persistStoredSession(graphId, currentSessionId.value)
      else clearStoredSession(graphId)
      await loadMessagesForSession(currentSessionId.value)
    }
  }

  async function addMessage(role, content, context = null) {
    const graphId = graphStore.currentGraphId
    if (!graphId) return null

    const sessionId = await ensureActiveSession()
    if (!sessionId) return null

    const msg = {
      id: generateId('m'),
      graphId,
      role,
      content,
      context,
      timestamp: Date.now()
    }
    messages.value.push(msg)

    try {
      await postMessage(sessionId, msg)
    } catch (error) {
      console.warn('[ragStore] failed to persist message:', error.message)
    }

    return msg
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
    resetGraphView()
    if (!currentSessionId.value) return

    try {
      await clearMessagesApi(currentSessionId.value)
    } catch (error) {
      console.warn('[ragStore] failed to clear messages:', error.message)
    }
  }

  watch(() => graphStore.currentGraphId, loadSessionsForWorkspace, { immediate: true })

  return {
    sessions,
    currentSessionId,
    currentSession,
    messages,
    isLoading,
    lastContext,
    activeMessageId,
    createSession,
    ensureActiveSession,
    switchSession,
    renameSession,
    deleteSession,
    addMessage,
    setLoading,
    setLastContext,
    selectMessage,
    clearMessages
  }
})
