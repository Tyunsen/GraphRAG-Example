/**
 * JSON Parser - supports 3 formats:
 * 1. { nodes: [...], edges: [...] }  (or links/relations)
 * 2. Array of triples: [{ subject, predicate, object }, ...]
 * 3. Adjacency list: { "NodeA": { "rel": ["NodeB", ...] }, ... }
 */
import {
  looksLikeAdjacencyObject,
  looksLikeGraphLabel,
  looksLikeStructuredGraphArray
} from './graphImportHeuristics.js'

export function parseJSON(text) {
  const data = JSON.parse(text)

  // Format 1: nodes/edges structure
  if ((data.nodes || data.vertices) && Array.isArray(data.nodes || data.vertices)) {
    return parseNodesEdges(data)
  }

  // Format 2: array of triples
  if (Array.isArray(data)) {
    if (data.length > 0 && (data[0].subject || data[0].head)) {
      return parseTriples(data)
    }
    if (looksLikeStructuredGraphArray(data)) {
      return { nodes: data.map(normalizeNode), edges: [] }
    }
    return { nodes: [], edges: [] }
  }

  // Format 3: adjacency list
  if (looksLikeAdjacencyObject(data)) {
    return parseAdjacencyList(data)
  }

  return { nodes: [], edges: [] }
}

function parseNodesEdges(data) {
  const rawNodes = data.nodes || data.vertices || []
  const rawEdges = data.edges || data.links || data.relations || []

  const nodes = rawNodes.map(normalizeNode).filter(Boolean)
  const edges = rawEdges
    .map(e => ({
      source: e.source || e.from || e.subject || e.head || '',
      target: e.target || e.to || e.object || e.tail || '',
      label: e.label || e.relation || e.predicate || e.type || '',
      weight: e.weight || 1,
      properties: e.properties || {}
    }))
    .filter(edge => looksLikeGraphLabel(edge.source) && looksLikeGraphLabel(edge.target))

  return { nodes, edges }
}

function parseTriples(triples) {
  const nodeSet = new Map()
  const edges = []

  for (const t of triples) {
    const subj = t.subject || t.head || t.source || ''
    const pred = t.predicate || t.relation || t.label || t.type || ''
    const obj = t.object || t.tail || t.target || ''

    if (looksLikeGraphLabel(subj) && looksLikeGraphLabel(obj)) {
      if (!nodeSet.has(subj)) nodeSet.set(subj, { label: subj, type: t.subject_type || 'entity' })
      if (!nodeSet.has(obj)) nodeSet.set(obj, { label: obj, type: t.object_type || 'entity' })
      edges.push({ source: subj, target: obj, label: pred })
    }
  }

  return { nodes: Array.from(nodeSet.values()), edges }
}

function parseAdjacencyList(adj) {
  const nodeSet = new Map()
  const edges = []

  for (const [source, rels] of Object.entries(adj)) {
    if (!looksLikeGraphLabel(source, 60)) continue
    if (!nodeSet.has(source)) nodeSet.set(source, { label: source, type: 'entity' })

    if (typeof rels === 'object' && !Array.isArray(rels)) {
      for (const [relation, targets] of Object.entries(rels)) {
        const targetList = Array.isArray(targets) ? targets : [targets]
        for (const target of targetList) {
          if (!looksLikeGraphLabel(target, 60)) continue
          if (!nodeSet.has(target)) nodeSet.set(target, { label: target, type: 'entity' })
          edges.push({ source, target, label: relation })
        }
      }
    } else if (Array.isArray(rels)) {
      for (const target of rels) {
        if (typeof target === 'string' && looksLikeGraphLabel(target, 60)) {
          if (!nodeSet.has(target)) nodeSet.set(target, { label: target, type: 'entity' })
          edges.push({ source, target, label: '' })
        }
      }
    }
  }

  return { nodes: Array.from(nodeSet.values()), edges }
}

function normalizeNode(n) {
  const label = n.label || n.name || n.id || String(n)
  if (!looksLikeGraphLabel(label)) return null
  return {
    label,
    type: n.type || n.category || n.group || 'entity',
    properties: n.properties || {}
  }
}
