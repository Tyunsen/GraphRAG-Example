const CN_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '也', '一个', '一个人',
  '这', '那', '这些', '那些', '什么', '怎么', '如何', '为什么', '哪里', '谁',
  '多少', '可以', '应该', '可能', '需要', '觉得', '认为', '但是', '然而', '因为',
  '所以', '如果', '而且', '或者', '以及', '关于', '通过', '相关', '信息', '内容',
  '情况', '哪些', '一下', '一下子', '请问', '里面', '有关', '有没有'
])

const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'up',
  'down', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'about'
])

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function tokenize(text) {
  if (!text) return []

  const tokens = []
  const cnMatches = String(text).match(/[\u4e00-\u9fff]{2,}/g) || []
  for (const segment of cnMatches) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    if (trimmed.length <= 6) {
      tokens.push(trimmed)
      continue
    }

    for (let index = 0; index < trimmed.length - 1; index++) {
      tokens.push(trimmed.slice(index, index + 2))
    }
  }

  const enMatches = String(text).match(/[a-zA-Z]+/g) || []
  for (const word of enMatches) {
    const lower = word.toLowerCase()
    if (lower.length > 1 && !EN_STOP_WORDS.has(lower)) {
      tokens.push(lower)
    }
  }

  return tokens
}

export function extractKeywords(text) {
  if (!text) return []
  return unique(
    tokenize(text).filter(token => {
      const normalized = String(token || '').trim().toLowerCase()
      if (!normalized) return false
      if (EN_STOP_WORDS.has(normalized)) return false
      return !CN_STOP_WORDS.has(normalized)
    })
  )
}

export function normalizeLabel(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
