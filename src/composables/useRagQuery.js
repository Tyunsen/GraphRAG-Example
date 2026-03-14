import { useGraphStore } from '@/stores/graphStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRagStore } from '@/stores/ragStore'
import { fetchMessages } from '@/services/apiClient'
import { retrieveContext } from '@/services/ragRetriever'
import { callLLM, buildRAGMessages, sanitizeRAGAnswer } from '@/services/llmApiService'

const PLACEHOLDER_TITLES = new Set(['默认会话', '新会话', '开始对话'])
const refreshingSessionIds = new Set()

function isPlaceholderTitle(title) {
  return !title || PLACEHOLDER_TITLES.has(String(title).trim())
}

function buildFallbackTitle(query) {
  return String(query || '')
    .replace(/[？?！!。，“”"'：:、,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14) || '研究对话'
}

function normalizeTitle(title, query) {
  const cleaned = String(title || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[？?！!。，“”"'：:、,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    !cleaned ||
    cleaned.length < 2 ||
    cleaned.length > 18 ||
    cleaned.includes('抱歉') ||
    cleaned.includes('请提供') ||
    cleaned.includes('用户') ||
    cleaned.includes('问题')
  ) {
    return buildFallbackTitle(query)
  }

  return cleaned
}

async function generateSessionTitle(settings, query, answer) {
  try {
    const title = (await callLLM(
      { ...settings, temperature: 0.2, maxTokens: 32 },
      [
        {
          role: 'system',
          content: '请基于用户问题和回答，总结一个简短中文会话标题。要求 6 到 14 个字，不要标点，不要书名号，不要输出解释。'
        },
        {
          role: 'user',
          content: `问题：${query}\n回答：${answer || '无'}`
        }
      ]
    )).replace(/[\r\n]/g, '').trim()

    return normalizeTitle(title, query)
  } catch (error) {
    console.warn('[useRagQuery] failed to generate title, fallback to query:', error.message)
    return buildFallbackTitle(query)
  }
}

export function useRagQuery() {
  const graphStore = useGraphStore()
  const settings = useSettingsStore()
  const ragStore = useRagStore()

  async function refreshSessionTitle(session, prefetchedMessages = null) {
    if (!session?.id || !isPlaceholderTitle(session.title) || refreshingSessionIds.has(session.id)) return

    refreshingSessionIds.add(session.id)
    try {
      const messages = prefetchedMessages || await fetchMessages(session.id)
      const firstUser = messages.find(item => item.role === 'user' && item.content?.trim())
      if (!firstUser) return

      const firstAssistant = messages.find(item => item.role === 'assistant' && item.content?.trim())
      const title = await generateSessionTitle(settings, firstUser.content, firstAssistant?.content || '')
      if (title) {
        await ragStore.renameSession(session.id, title.slice(0, 18))
      }
    } finally {
      refreshingSessionIds.delete(session.id)
    }
  }

  async function refreshWorkspaceSessionTitles() {
    for (const session of ragStore.sessions) {
      if (!isPlaceholderTitle(session.title)) continue
      await refreshSessionTitle(session)
    }
  }

  async function askQuestion(query) {
    if (!query.trim()) return

    await ragStore.addMessage('user', query)
    ragStore.setLoading(true)

    try {
      const context = await retrieveContext(graphStore, query, settings)
      ragStore.setLastContext(context)

      if (!context) {
        const assistantMessage = await ragStore.addMessage('assistant', '现有图谱和文档里没有找到与这个问题直接相关的证据。')
        await refreshSessionTitle(ragStore.currentSession, [
          { role: 'user', content: query },
          { role: 'assistant', content: '现有图谱和文档里没有找到与这个问题直接相关的证据。' }
        ])
        if (assistantMessage?.id) {
          ragStore.selectMessage(assistantMessage.id)
        }
        return
      }

      graphStore.setHighlightedNodes(context.nodeIds)

      const messages = buildRAGMessages(context.text, query)
      const answer = sanitizeRAGAnswer(await callLLM(settings, messages))

      const assistantMessage = await ragStore.addMessage('assistant', answer, context)
      await refreshSessionTitle(ragStore.currentSession, [
        { role: 'user', content: query },
        { role: 'assistant', content: answer }
      ])

      if (assistantMessage?.id) {
        ragStore.selectMessage(assistantMessage.id)
      }
    } catch (e) {
      await ragStore.addMessage('assistant', `查询失败：${e.message}`)
    } finally {
      ragStore.setLoading(false)
    }
  }

  return {
    askQuestion,
    refreshSessionTitle,
    refreshWorkspaceSessionTitles
  }
}
