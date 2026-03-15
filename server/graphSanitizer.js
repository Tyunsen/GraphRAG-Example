const EVENT_TYPE = '事件'
const MAX_ENTITY_LABEL_LENGTH = 28
const MAX_EVENT_LABEL_LENGTH = 72
const ENTITY_PREFIX_TERMS = ['在', '对', '将', '把', '从', '向', '为', '由', '据', '中', '了']
const ENTITY_ACTION_TERMS = [
  '要求', '表示', '曾言', '试行', '升级', '推动', '举行', '召开', '发动', '袭击',
  '打击', '反击', '抗议', '发布', '启动', '实现', '生效', '签署', '谈判', '参加',
  '提出', '强调', '部署', '完成', '发射', '遭遇', '摧毁', '延伸', '实施', '出现',
  '卷入', '波及', '告知', '警告', '封锁', '影响'
]
const ENTITY_FRAGMENT_TERMS = [
  '多家媒体称', '与此同时', '换句话说', '从军事角度看', '从经济角度看', '这场战争',
  '该设施', '该地区', '相关报道显示', '周边国家', '城市上空', '园区内', '地下设施',
  '再次遭遇', '前后再次', '并把', '并将', '则因', '同时连接', '最终可能', '未来几周',
  '相邻的', '被波及', '多名高级成员', '首轮', '称其'
]
const ENTITY_BAD_ENDINGS = ['的', '了', '和', '与', '并', '及', '中', '后', '前', '时', '等', '其', '并把', '因', '将', '视', '首轮']

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
    if (/[，。；：]/.test(text)) return true
    if (text.length >= 8 && ENTITY_FRAGMENT_TERMS.some(term => text.includes(term))) return true
    if (text.length >= 8 && ENTITY_BAD_ENDINGS.some(term => text.endsWith(term))) return true
    if (text.length >= 10 && /(\d+月|\d+日|前后|再次|期间|阶段|开局)/.test(text)) return true
    if (text.length >= 6 && /^[\u4e00-\u9fff]+对[\u4e00-\u9fff]+$/.test(text)) return true
  }

  return false
}

export function sanitizeGraphLabel(label = '', nodeType = '') {
  const text = normalizeWhitespace(label)
  if (isBadGraphLabel(text, nodeType)) return ''
  return text
}
