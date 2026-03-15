const EVENT_TYPE = '事件'
const MAX_ENTITY_LABEL_LENGTH = 48
const MAX_EVENT_LABEL_LENGTH = 72
const ENTITY_PREFIX_TERMS = ['在', '对', '将', '把', '从', '向', '为', '由', '据']
const ENTITY_ACTION_TERMS = [
  '要求', '表示', '曾言', '试行', '升级', '推动', '举行', '召开', '发动', '袭击',
  '打击', '反击', '抗议', '发布', '启动', '实现', '生效', '签署', '谈判', '参加',
  '提出', '强调', '部署', '完成'
]

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

  const isEvent = /事件|event/i.test(String(nodeType || '').trim())
  if (!isEvent) {
    if (/^[a-z]/i.test(text) && !/^[A-Z]{2,}$/.test(text)) return true
    if (text.length >= 6 && ENTITY_PREFIX_TERMS.some(prefix => text.startsWith(prefix))) return true
    if (text.length >= 6 && ENTITY_ACTION_TERMS.some(term => text.includes(term))) return true
  }

  return false
}

export function sanitizeGraphLabel(label = '', nodeType = '') {
  const text = normalizeWhitespace(label)
  if (isBadGraphLabel(text, nodeType)) return ''
  return text
}
