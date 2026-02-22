const CN_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '些', '什么', '怎么', '如何', '为什么',
  '哪', '谁', '多少', '这个', '那个', '这些', '那些', '可以', '能', '会', '应该',
  '可能', '需要', '想', '知道', '觉得', '认为', '但是', '然而', '因为', '所以',
  '如果', '虽然', '而且', '或者', '以及', '还是', '不是', '从', '对', '与', '被',
  '把', '让', '给', '向', '用', '通过', '关于', '之', '其', '此', '该'
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

export function tokenize(text) {
  if (!text) return []
  const tokens = []

  // Extract Chinese character sequences
  const cnMatches = text.match(/[\u4e00-\u9fff]{2,}/g) || []
  for (const seg of cnMatches) {
    // Simple bigram segmentation for Chinese
    if (seg.length <= 4) {
      tokens.push(seg)
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.substring(i, i + 2))
      }
    }
  }

  // Extract English word sequences
  const enMatches = text.match(/[a-zA-Z]+/g) || []
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
  const tokens = tokenize(text)
  // Remove Chinese stop words
  const filtered = tokens.filter(t => !CN_STOP_WORDS.has(t))
  // Deduplicate while preserving order
  return [...new Set(filtered)]
}

export function normalizeLabel(label) {
  return (label || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
