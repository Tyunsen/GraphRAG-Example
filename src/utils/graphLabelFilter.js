function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const QUESTION_TERMS = ['为什么', '为何', '为啥', '怎么', '如何', '谁', '什么', '什么时候', '哪里', '哪儿', '是否']
const FRAGMENT_TERMS = ['这些', '这种', '这个', '那个', '并不', '非常', '清楚', '试图', '联动的', '抽象金融指标']
const HIDDEN_RELATIONS = new Set(['共现'])

function hasAdjacentRepeat(text) {
  let repeatedChars = 0
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) repeatedChars += 1
  }
  if (repeatedChars >= 2) return true

  for (const size of [2, 3]) {
    for (let i = 0; i <= text.length - size * 2; i++) {
      const seg = text.slice(i, i + size)
      if (seg && text.slice(i + size, i + size * 2) === seg) return true
    }
  }

  return false
}

export function isDisplayableGraphLabel(label) {
  const text = normalizeText(label)
  if (!text) return false
  if (/^文档\d+[：:]/.test(text)) return false
  if (/[?？]/.test(text)) return false
  if (QUESTION_TERMS.some(term => text.includes(term))) return false
  if (text.length >= 5 && FRAGMENT_TERMS.some(term => text.includes(term))) return false
  if (hasAdjacentRepeat(text)) return false
  return true
}

export function filterDisplayableLabels(labels = []) {
  return labels.filter(isDisplayableGraphLabel)
}

export function isDisplayableRelationLabel(label) {
  const text = normalizeText(label)
  if (!text) return false
  return !HIDDEN_RELATIONS.has(text)
}

