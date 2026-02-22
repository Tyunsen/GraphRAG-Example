import { extractKeywords } from '@/utils/textTokenizer'
import { findSeedNodes } from './graphService'
import { searchFiles } from './apiClient'

/**
 * Retrieve context for RAG query.
 * Priority: imported document content (primary) + graph structure (supplementary)
 */
export async function retrieveContext(graphStore, query, settings) {
  const keywords = extractKeywords(query)
  if (keywords.length === 0) return null

  // 1. File content retrieval (PRIMARY source)
  let fileResults = []
  const graphId = graphStore.currentGraphId
  if (graphId) {
    try {
      fileResults = (await searchFiles(graphId, keywords)) || []
    } catch (e) {
      console.warn('[ragRetriever] File search failed:', e.message)
    }
  }

  // 2. Graph-based retrieval (SUPPLEMENTARY)
  const seedIds = findSeedNodes(graphStore, keywords)
  let subgraph = { nodes: [], edges: [] }
  if (seedIds.length > 0) {
    subgraph = graphStore.bfsSubgraph(
      seedIds,
      settings.bfsDepth,
      settings.bfsMaxNodes
    )
  }

  // Need at least some content to answer
  if (fileResults.length === 0 && subgraph.nodes.length === 0) return null

  const contextText = formatCombinedContext(fileResults, subgraph)
  return {
    text: contextText,
    keywords,
    seedIds,
    subgraph,
    fileSnippets: fileResults,
    nodeIds: subgraph.nodes.map(n => n.id)
  }
}

/**
 * Format context: document content first (primary), graph structure second (supplementary)
 */
function formatCombinedContext(fileResults, subgraph) {
  const lines = []

  // ── Document content (PRIMARY) ────────────────────────────
  if (fileResults.length > 0) {
    lines.push('=== 原始文档内容（主要参考依据）===')

    for (const file of fileResults) {
      lines.push('')
      lines.push(`【文件: ${file.fileName}】`)

      // If fullContent is available (high relevance), use it
      if (file.fullContent) {
        lines.push(file.fullContent.trim())
      } else {
        // Otherwise use matched snippets
        for (const snippet of (file.snippets || [])) {
          lines.push(snippet.trim())
          lines.push('...')
        }
      }
    }
  }

  // ── Graph structure (SUPPLEMENTARY) ───────────────────────
  if (subgraph.nodes.length > 0) {
    lines.push('')
    lines.push('=== 知识图谱结构（辅助参考）===')
    lines.push('')
    lines.push('【实体】')
    for (const node of subgraph.nodes) {
      let desc = `- ${node.label}`
      if (node.type && node.type !== 'entity' && node.type !== 'default') {
        desc += ` (${node.type})`
      }
      const props = Object.entries(node.properties || {})
      if (props.length > 0) {
        desc += ` [${props.map(([k, v]) => `${k}: ${v}`).join(', ')}]`
      }
      lines.push(desc)
    }

    if (subgraph.edges.length > 0) {
      lines.push('')
      lines.push('【关系】')
      const nodeMap = new Map(subgraph.nodes.map(n => [n.id, n.label]))
      for (const edge of subgraph.edges) {
        const src = nodeMap.get(edge.source) || edge.source
        const tgt = nodeMap.get(edge.target) || edge.target
        const rel = edge.label || '关联'
        lines.push(`- ${src} --[${rel}]--> ${tgt}`)
      }
    }
  }

  return lines.join('\n')
}
