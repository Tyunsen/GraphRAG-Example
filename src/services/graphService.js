import { useGraphStore } from '@/stores/graphStore'
import { normalizeLabel } from '@/utils/textTokenizer'
import { isDisplayableGraphLabel, isDisplayableRelationLabel } from '@/utils/graphLabelFilter'

/**
 * Get formatted subgraph data ready for D3 rendering
 */
export function getD3Data(graphStore) {
  const nodes = graphStore.nodeList
    .filter(n => isDisplayableGraphLabel(n.label))
    .map(n => ({
    id: n.id,
    label: n.label,
    type: n.type,
    degree: graphStore.getNodeDegree(n.id),
    highlighted: graphStore.highlightedNodes.has(n.id)
    }))

  const visibleIds = new Set(nodes.map(node => node.id))

  const edges = graphStore.edgeList
    .filter(e =>
      visibleIds.has(e.source) &&
      visibleIds.has(e.target) &&
      isDisplayableRelationLabel(e.label)
    )
    .map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    weight: e.weight
    }))

  return { nodes, edges }
}

/**
 * Search nodes by keyword matching label or properties
 */
export function searchNodes(graphStore, keyword) {
  if (!keyword) return []
  const lower = keyword.toLowerCase()
  const results = []

  for (const node of graphStore.nodes.values()) {
    if (!isDisplayableGraphLabel(node.label)) continue
    let score = 0
    const labelLower = node.label.toLowerCase()

    if (labelLower === lower) score = 10
    else if (labelLower.includes(lower)) score = 5

    // Check properties
    for (const val of Object.values(node.properties)) {
      if (String(val).toLowerCase().includes(lower)) {
        score = Math.max(score, 3)
      }
    }

    if (score > 0) results.push({ node, score })
  }

  return results.sort((a, b) => b.score - a.score).map(r => r.node)
}

/**
 * Find seed nodes for RAG based on keywords
 */
export function findSeedNodes(graphStore, keywords, maxSeeds = 10) {
  const scored = new Map()

  for (const keyword of keywords) {
    const lower = keyword.toLowerCase()
    for (const node of graphStore.nodes.values()) {
      if (!isDisplayableGraphLabel(node.label)) continue
      const labelLower = node.label.toLowerCase()
      let score = scored.get(node.id) || 0

      if (labelLower === lower) score += 10
      else if (labelLower.includes(lower) || lower.includes(labelLower)) score += 5

      for (const val of Object.values(node.properties)) {
        if (String(val).toLowerCase().includes(lower)) score += 2
      }

      if (score > 0) scored.set(node.id, score)
    }
  }

  return Array.from(scored.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSeeds)
    .map(([id]) => id)
}
