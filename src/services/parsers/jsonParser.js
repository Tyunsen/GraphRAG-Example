/**
 * JSON Parser - supports 3 formats:
 * 1. { nodes: [...], edges: [...] }  (or links/relations)
 * 2. Array of triples: [{ subject, predicate, object }, ...]
 * 3. Adjacency list: { "NodeA": { "rel": ["NodeB", ...] }, ... }
 */

export function parseJSON(text) {
  const data = JSON.parse(text)

  // Format 1: nodes/edges structure
  if (data.nodes || data.vertices) {
    return parseNodesEdges(data)
  }

  // Format 2: array of triples
  if (Array.isArray(data)) {
    if (data.length > 0 && (data[0].subject || data[0].head)) {
      return parseTriples(data)
    }
    // Could be a node array
    if (data.length > 0 && (data[0].label || data[0].name || data[0].id)) {
      return { nodes: data.map(normalizeNode), edges: [] }
    }
    return { nodes: [], edges: [] }
  }

  // Format 3: adjacency list
  if (typeof data === 'object') {
    return parseAdjacencyList(data)
  }

  return { nodes: [], edges: [] }
}

function parseNodesEdges(data) {
  const rawNodes = data.nodes || data.vertices || []
  const rawEdges = data.edges || data.links || data.relations || []

  const nodes = rawNodes.map(normalizeNode)
  const edges = rawEdges.map(e => ({
    source: e.source || e.from || e.subject || e.head || '',
    target: e.target || e.to || e.object || e.tail || '',
    label: e.label || e.relation || e.predicate || e.type || '',
    weight: e.weight || 1,
    properties: e.properties || {}
  }))

  return { nodes, edges }
}

function parseTriples(triples) {
  const nodeSet = new Map()
  const edges = []

  for (const t of triples) {
    const subj = t.subject || t.head || t.source || ''
    const pred = t.predicate || t.relation || t.label || t.type || ''
    const obj = t.object || t.tail || t.target || ''

    if (subj && obj) {
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
    if (!nodeSet.has(source)) nodeSet.set(source, { label: source, type: 'entity' })

    if (typeof rels === 'object' && !Array.isArray(rels)) {
      for (const [relation, targets] of Object.entries(rels)) {
        const targetList = Array.isArray(targets) ? targets : [targets]
        for (const target of targetList) {
          if (!nodeSet.has(target)) nodeSet.set(target, { label: target, type: 'entity' })
          edges.push({ source, target, label: relation })
        }
      }
    } else if (Array.isArray(rels)) {
      for (const target of rels) {
        if (typeof target === 'string') {
          if (!nodeSet.has(target)) nodeSet.set(target, { label: target, type: 'entity' })
          edges.push({ source, target, label: '' })
        }
      }
    }
  }

  return { nodes: Array.from(nodeSet.values()), edges }
}

function normalizeNode(n) {
  return {
    label: n.label || n.name || n.id || String(n),
    type: n.type || n.category || n.group || 'entity',
    properties: n.properties || {}
  }
}
