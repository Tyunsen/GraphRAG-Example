const MAX_IMPORT_LABEL_LENGTH = 80

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksLikeGraphLabel(value = '', maxLength = MAX_IMPORT_LABEL_LENGTH) {
  const text = normalizeWhitespace(value)
  if (!text) return false
  if (text.length > maxLength) return false
  if (/!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/|www\./i.test(text)) return false
  if (/[\r\n\t]/.test(String(value || ''))) return false
  if (/发布时间|摘要|链接|全文|原标题|记者|来源/i.test(text) && text.length >= 18) return false
  return true
}

export function looksLikeGraphNodeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  const label = record.label || record.name || record.entity || record.id || ''
  if (!looksLikeGraphLabel(label)) return false

  const graphKeys = ['label', 'name', 'entity', 'id', 'type', 'category', 'group', 'properties']
  return Object.keys(record).some(key => graphKeys.includes(String(key || '').trim()))
}

export function looksLikeAdjacencyObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const entries = Object.entries(data)
  if (entries.length === 0 || entries.length > 300) return false

  let graphishEntries = 0
  for (const [source, rels] of entries.slice(0, 40)) {
    if (!looksLikeGraphLabel(source, 60)) return false
    if (Array.isArray(rels)) {
      if (rels.every(item => typeof item === 'string' && looksLikeGraphLabel(item, 60))) {
        graphishEntries += 1
      }
      continue
    }
    if (rels && typeof rels === 'object') {
      const relationEntries = Object.entries(rels)
      if (relationEntries.length === 0) continue
      const valid = relationEntries.every(([relation, target]) => {
        if (!looksLikeGraphLabel(relation, 24)) return false
        const targets = Array.isArray(target) ? target : [target]
        return targets.every(item => typeof item === 'string' && looksLikeGraphLabel(item, 60))
      })
      if (valid) graphishEntries += 1
    }
  }

  return graphishEntries > 0
}

export function looksLikeStructuredGraphArray(items = []) {
  if (!Array.isArray(items) || items.length === 0) return false
  const sample = items.slice(0, 20)
  return sample.every(item => looksLikeGraphNodeRecord(item))
}

export function looksLikeEntityTable(rows = [], labelField = '', fields = []) {
  if (!Array.isArray(rows) || rows.length === 0 || !labelField) return false

  const lowerFields = fields.map(field => String(field || '').toLowerCase().trim())
  if (lowerFields.some(field => ['content', 'body', 'summary', 'link', 'url', 'href', 'markdown', 'html'].includes(field))) {
    return false
  }

  const sampleLabels = rows
    .slice(0, 30)
    .map(row => row?.[labelField])
    .filter(value => value != null)
    .map(value => normalizeWhitespace(value))

  if (sampleLabels.length === 0) return false
  const validCount = sampleLabels.filter(label => looksLikeGraphLabel(label)).length
  return validCount / sampleLabels.length >= 0.8
}

