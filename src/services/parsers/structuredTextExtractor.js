import Papa from 'papaparse'

const TITLE_FIELDS = ['title', 'headline', 'name', 'subject']
const CONTENT_FIELDS = ['content', 'summary', 'abstract', 'description', 'body', 'text', 'article', 'markdown']
const SOURCE_FIELDS = ['source', 'media', 'publisher']
const TIME_FIELDS = ['published', 'published_at', 'publish_time', 'time', 'date', 'fetched_at']

const NAVIGATION_NOISE = new Set([
  '最新', '国际', '中国', '财经', '体育', '娱乐', '生活', '视频', '专题', '评论', '社论', '交流站',
  '漫画', '新加坡', '东南亚', '投资理财', '房产', '美国股市', '热门', '更多消息', '订阅'
])

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripMarkdownNoise(value = '') {
  return normalizeWhitespace(
    String(value || '')
      .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/blob:\S+/g, ' ')
      .replace(/[=*#>`~_-]{3,}/g, ' ')
  )
}

function looksMeaningfulText(value = '', minLength = 4) {
  const text = normalizeWhitespace(value)
  if (text.length < minLength) return false
  if (NAVIGATION_NOISE.has(text)) return false
  return /[\u4e00-\u9fffA-Za-z]/.test(text)
}

function truncateText(value = '', maxLength = 220) {
  const text = normalizeWhitespace(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function findFirstField(row, candidates = []) {
  const entries = Object.entries(row || {})
  for (const candidate of candidates) {
    const match = entries.find(([key]) => key.toLowerCase().trim() === candidate)
    if (match && looksMeaningfulText(match[1])) return String(match[1] || '').trim()
  }
  return ''
}

function extractMarkdownLinkTitles(value = '') {
  const titles = []
  const source = String(value || '')
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
  let match
  while ((match = regex.exec(source))) {
    const text = stripMarkdownNoise(match[1])
    if (!looksMeaningfulText(text, 6)) continue
    if (text.length > 60) continue
    if (/Image \d+/i.test(text)) continue
    titles.push(text)
  }
  return [...new Set(titles)]
}

function normalizeRecordText(parts = []) {
  return parts
    .map(part => normalizeWhitespace(part))
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function extractCSVText(text = '') {
  const parsed = Papa.parse(String(text || '').trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  })

  const rows = Array.isArray(parsed.data) ? parsed.data : []
  if (rows.length === 0) return stripMarkdownNoise(text)

  const records = []
  for (const row of rows) {
    const title = stripMarkdownNoise(findFirstField(row, TITLE_FIELDS))
    const content = stripMarkdownNoise(findFirstField(row, CONTENT_FIELDS))
    const source = stripMarkdownNoise(findFirstField(row, SOURCE_FIELDS))
    const publishedAt = stripMarkdownNoise(findFirstField(row, TIME_FIELDS))
    const linkedTitles = extractMarkdownLinkTitles(findFirstField(row, CONTENT_FIELDS)).slice(0, 8)

    const record = normalizeRecordText([
      looksMeaningfulText(title, 6) ? `标题：${title}` : '',
      looksMeaningfulText(source, 2) ? `来源：${source}` : '',
      looksMeaningfulText(publishedAt, 4) ? `时间：${publishedAt}` : '',
      linkedTitles.length > 0 ? `相关条目：${linkedTitles.join('；')}` : '',
      looksMeaningfulText(content, 12) ? `内容：${truncateText(content, 320)}` : ''
    ])

    if (record) records.push(record)
  }

  if (records.length > 0) return records.join('\n\n')
  return stripMarkdownNoise(text)
}

function flattenJsonRecords(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonRecords(item, output)
    return output
  }

  if (value && typeof value === 'object') {
    const title = stripMarkdownNoise(findFirstField(value, TITLE_FIELDS))
    const content = stripMarkdownNoise(findFirstField(value, CONTENT_FIELDS))
    const source = stripMarkdownNoise(findFirstField(value, SOURCE_FIELDS))
    const publishedAt = stripMarkdownNoise(findFirstField(value, TIME_FIELDS))
    const linkedTitles = extractMarkdownLinkTitles(findFirstField(value, CONTENT_FIELDS)).slice(0, 8)

    const record = normalizeRecordText([
      looksMeaningfulText(title, 6) ? `标题：${title}` : '',
      looksMeaningfulText(source, 2) ? `来源：${source}` : '',
      looksMeaningfulText(publishedAt, 4) ? `时间：${publishedAt}` : '',
      linkedTitles.length > 0 ? `相关条目：${linkedTitles.join('；')}` : '',
      looksMeaningfulText(content, 12) ? `内容：${truncateText(content, 320)}` : ''
    ])

    if (record) {
      output.push(record)
      return output
    }

    for (const nested of Object.values(value)) flattenJsonRecords(nested, output)
  }

  return output
}

export function extractJSONText(text = '') {
  try {
    const data = JSON.parse(text)
    const records = flattenJsonRecords(data, [])
    if (records.length > 0) return records.join('\n\n')
    return stripMarkdownNoise(text)
  } catch {
    return stripMarkdownNoise(text)
  }
}
