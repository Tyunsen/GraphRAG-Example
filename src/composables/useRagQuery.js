import { useGraphStore } from '@/stores/graphStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRagStore } from '@/stores/ragStore'
import { retrieveContext } from '@/services/ragRetriever'
import { callLLM, buildRAGMessages, sanitizeRAGAnswer } from '@/services/llmApiService'

const PLACEHOLDER_TITLES = new Set(['默认会话', '新会话', '开始对话'])

async function maybeGenerateSessionTitle(settings, ragStore, query, answer) {
  const sessionId = ragStore.currentSessionId
  const currentTitle = ragStore.currentSession?.title?.trim()
  if (!sessionId || (currentTitle && !PLACEHOLDER_TITLES.has(currentTitle))) return

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
          content: `问题：${query}\n回答：${answer}`
        }
      ]
    )).replace(/[\r\n]/g, '').trim()

    if (title) {
      await ragStore.renameSession(sessionId, title.slice(0, 18))
    }
  } catch (error) {
    console.warn('[useRagQuery] failed to generate session title:', error.message)
  }
}

export function useRagQuery() {
  const graphStore = useGraphStore()
  const settings = useSettingsStore()
  const ragStore = useRagStore()

  async function askQuestion(query) {
    if (!query.trim()) return

    await ragStore.addMessage('user', query)
    ragStore.setLoading(true)

    try {
      const context = await retrieveContext(graphStore, query, settings)
      ragStore.setLastContext(context)

      if (!context) {
        await ragStore.addMessage('assistant', '现有图谱和文档里没有找到与这个问题直接相关的证据。')
        return
      }

      graphStore.setHighlightedNodes(context.nodeIds)

      const messages = buildRAGMessages(context.text, query)
      const answer = sanitizeRAGAnswer(await callLLM(settings, messages))

      const assistantMessage = await ragStore.addMessage('assistant', answer, context)
      await maybeGenerateSessionTitle(settings, ragStore, query, answer)

      if (assistantMessage?.id) {
        ragStore.selectMessage(assistantMessage.id)
      }
    } catch (e) {
      await ragStore.addMessage('assistant', `查询失败：${e.message}`)
    } finally {
      ragStore.setLoading(false)
    }
  }

  return { askQuestion }
}
