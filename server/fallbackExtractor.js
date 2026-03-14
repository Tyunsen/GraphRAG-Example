function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function clean(text = '') {
  return String(text || '').trim()
}

function addNode(nodeMap, label, type = '概念') {
  const normalized = clean(label)
  if (!normalized || normalized.length < 2) return
  const key = normalized.toLowerCase()
  if (!nodeMap.has(key)) {
    nodeMap.set(key, { label: normalized, type, properties: {} })
  }
}

export function extractFallbackGraph(text = '') {
  const nodeMap = new Map()
  const quoted = String(text || '').match(/[“"《](.+?)[”"》]/g) || []
  for (const item of quoted) {
    addNode(nodeMap, item.slice(1, -1), '概念')
  }

  const englishTerms = unique(String(text || '').match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [])
  for (const item of englishTerms) {
    addNode(nodeMap, item, '概念')
  }

  return {
    nodes: [...nodeMap.values()],
    edges: []
  }
}
