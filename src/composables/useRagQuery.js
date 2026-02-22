import { ref } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRagStore } from '@/stores/ragStore'
import { retrieveContext } from '@/services/ragRetriever'
import { callLLM, buildRAGMessages } from '@/services/llmApiService'

export function useRagQuery() {
  const graphStore = useGraphStore()
  const settings = useSettingsStore()
  const ragStore = useRagStore()

  async function askQuestion(query) {
    if (!query.trim()) return

    ragStore.addMessage('user', query)
    ragStore.setLoading(true)

    try {
      // Retrieve context from knowledge graph + imported files
      const context = await retrieveContext(graphStore, query, settings)
      ragStore.setLastContext(context)

      if (!context) {
        ragStore.addMessage('assistant', '未在知识图谱中找到与问题相关的信息。请先导入相关数据，或尝试使用不同的关键词提问。')
        return
      }

      // Highlight related nodes
      graphStore.setHighlightedNodes(context.nodeIds)

      // Build messages and call LLM
      const messages = buildRAGMessages(context.text, query)
      const answer = await callLLM(settings, messages)

      ragStore.addMessage('assistant', answer, context)
    } catch (e) {
      ragStore.addMessage('assistant', `查询失败: ${e.message}`)
    } finally {
      ragStore.setLoading(false)
    }
  }

  return { askQuestion }
}
