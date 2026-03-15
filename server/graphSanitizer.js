const EVENT_TYPE = '事件'
const MAX_ENTITY_LABEL_LENGTH = 48
const MAX_EVENT_LABEL_LENGTH = 72

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getLabelLimit(nodeType = '') {
  return /事件|event/i.test(String(nodeType || '').trim())
    ? MAX_EVENT_LABEL_LENGTH
    : MAX_ENTITY_LABEL_LENGTH
}

function hasMarkdownOrUrl(text = '') {
  return /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/|www\./i.test(text)
}

function countMatches(text = '', pattern) {
  return (text.match(pattern) || []).length
}

export function isBadGraphLabel(label = '', nodeType = '') {
  const text = normalizeWhitespace(label)
  if (!text) return true
  if (text.length > getLabelLimit(nodeType)) return true
  if (/^#{1,6}\s/.test(text)) return true
  if (hasMarkdownOrUrl(text)) return true
  if (/[\r\n\t]/.test(String(label || ''))) return true

  const punctuationCount = countMatches(text, /[,:;!?，。；：！？“”"'`]/g)
  if (text.length >= 24 && punctuationCount >= 3) return true

  const sentenceLike = /[。！？；]|摘要|发布时间|链接|全文|点击|详见|原标题|记者|来源/i.test(text)
  if (sentenceLike && text.length >= 20) return true

  const spaceCount = countMatches(text, /\s/g)
  if (spaceCount >= 8) return true

  return false
}

export function sanitizeGraphLabel(label = '', nodeType = '') {
  const text = normalizeWhitespace(label)
  if (isBadGraphLabel(text, nodeType)) return ''
  return text
}

