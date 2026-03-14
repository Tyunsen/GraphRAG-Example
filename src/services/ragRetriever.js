import { extractKeywords } from '@/utils/textTokenizer'
import { findSeedNodes } from './graphService'
import { fetchWorkspaceContext, searchFiles } from './apiClient'

function dedupe(values) {
  return [...new Set(values.filter(Boolean))]
}

export async function retrieveContext(graphStore, query, settings) {
  const keywords = extractKeywords(query)
  if (keywords.length === 0) return null

  const graphId = graphStore.currentGraphId
  let evidence = []
  if (graphId) {
    try {
      evidence = await searchFiles(graphId, keywords)
    } catch (error) {
      console.warn('[ragRetriever] evidence search failed:', error.message)
    }
  }

  const evidenceLabels = dedupe(
    evidence.flatMap(item => [...(item.linkedNodes || []), ...(item.linkedEvents || [])])
  )

  let subgraph = { nodes: [], edges: [] }
  let seedIds = []
  if (graphId && evidenceLabels.length > 0) {
    try {
      const serverGraph = await fetchWorkspaceContext(graphId, {
        labels: [...keywords, ...evidenceLabels],
        maxDepth: settings.bfsDepth,
        maxNodes: settings.bfsMaxNodes,
        maxSeeds: 12,
        pathLimit: 240
      })
      subgraph = {
        nodes: serverGraph.nodes || [],
        edges: serverGraph.edges || []
      }
      seedIds = (serverGraph.nodes || []).map(node => node.id)
    } catch (error) {
      console.warn('[ragRetriever] graphdb context failed, fallback to local BFS:', error.message)
    }
  }

  if (subgraph.nodes.length === 0) {
    seedIds = findSeedNodes(graphStore, [...keywords, ...evidenceLabels])
    if (seedIds.length > 0) {
      subgraph = graphStore.bfsSubgraph(seedIds, settings.bfsDepth, settings.bfsMaxNodes)
    }
  }

  if (evidence.length === 0 && subgraph.nodes.length === 0) return null

  return {
    text: formatEvidenceContext(evidence, subgraph),
    keywords,
    seedIds,
    subgraph,
    evidence,
    nodeIds: subgraph.nodes.map(node => node.id)
  }
}

function formatEvidenceContext(evidence, subgraph) {
  const lines = ['=== 证据段落（优先依据）===']

  for (const item of evidence) {
    lines.push('')
    lines.push(`【${item.fileName} 第${item.paragraphIndex}段】`)
    lines.push(item.text.trim())
    lines.push(`涉及实体: ${(item.linkedNodes || []).join('、') || '无'}`)
    lines.push(`涉及事件: ${(item.linkedEvents || []).join('、') || '无'}`)
  }

  if (subgraph.nodes.length > 0) {
    lines.push('')
    lines.push('=== 图数据库子图（辅助线索）===')
    for (const node of subgraph.nodes) {
      lines.push(`- ${node.label} (${node.type || 'default'})`)
    }
    for (const edge of subgraph.edges) {
      const source = subgraph.nodes.find(node => node.id === edge.source)?.label || edge.source
      const target = subgraph.nodes.find(node => node.id === edge.target)?.label || edge.target
      lines.push(`- ${source} --[${edge.label || '关联'}]--> ${target}`)
    }
  }

  return lines.join('\n')
}
