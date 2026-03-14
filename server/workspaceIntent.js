const ENTITY_RULES = [
  { keywords: ['国家', '政府', '外交', '制裁'], type: '国家' },
  { keywords: ['人物', '领导人', '总统', '总理', '指挥官', '最高领袖'], type: '人物' },
  { keywords: ['组织', '武装', '军队', '机构', '媒体'], type: '组织' },
  { keywords: ['设施', '基地', '港口', '机场', '核设施', '海峡'], type: '设施' },
  { keywords: ['地点', '城市', '地区', '海湾', '中东'], type: '地点' },
  { keywords: ['油价', '经济', '能源', '航运', '通胀', '贸易'], type: '经济指标' },
  { keywords: ['协议', '谈判', '声明', '政策'], type: '概念' }
]

const EVENT_RULES = [
  { keywords: ['空袭', '轰炸', '打击', '袭击'], type: '军事打击' },
  { keywords: ['导弹', '发射', '拦截'], type: '导弹行动' },
  { keywords: ['谈判', '停火', '会谈'], type: '外交谈判' },
  { keywords: ['制裁', '施压'], type: '制裁施压' },
  { keywords: ['封锁', '航运', '海峡'], type: '航运风险' },
  { keywords: ['油价', '物价', '经济', '市场'], type: '经济波动' },
  { keywords: ['领导', '继任', '政权'], type: '政治变动' }
]

const DEFAULT_RELATIONS = [
  '别名',
  '隶属',
  '位于',
  '支持',
  '对抗',
  '领导',
  '拥有',
  '控制',
  '发起',
  '执行',
  '参与',
  '针对',
  '受影响',
  '发生于',
  '宣布',
  '造成',
  '导致',
  '触发',
  '升级',
  '回应',
  '并行',
  '停火',
  '终止',
  '佐证',
  '矛盾'
]

const INCLUDE_PATTERNS = [
  /只看(.+?)相关/,
  /只看(.+?)$/,
  /只关注(.+?)相关/,
  /只关注(.+?)$/,
  /仅看(.+?)相关/,
  /仅看(.+?)$/,
  /仅关注(.+?)相关/,
  /仅关注(.+?)$/,
  /聚焦(.+?)相关/,
  /聚焦(.+?)$/
]

const EXCLUDE_PATTERNS = [
  /不看(.+?)相关/,
  /排除(.+?)相关/,
  /排除(.+?)$/,
  /忽略(.+?)相关/,
  /忽略(.+?)$/
]

const KEYWORD_ALIASES = {
  中国: ['中国', '中方', '中国政府', '中国外交部', '中国方面', '北京'],
  美国: ['美国', '美方', '美国政府', '白宫', '华盛顿'],
  伊朗: ['伊朗', '伊方', '德黑兰', '伊朗政府'],
  以色列: ['以色列', '以方', '以军', '耶路撒冷'],
  俄罗斯: ['俄罗斯', '俄方', '莫斯科'],
  乌克兰: ['乌克兰', '乌方', '基辅']
}

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitConstraintTerms(value = '') {
  return dedupe(
    normalizeText(value)
      .replace(/相关的?|方面的?|内容的?|信息的?/g, '')
      .split(/[、，,；;和与及/\s]+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
  )
}

function extractConstraintTerms(source = '', patterns = []) {
  const collected = []
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (!match?.[1]) continue
    collected.push(...splitConstraintTerms(match[1]))
  }
  return dedupe(collected)
}

function expandKeywords(keywords = []) {
  const expanded = []
  for (const keyword of keywords) {
    expanded.push(keyword)
    if (KEYWORD_ALIASES[keyword]?.length) expanded.push(...KEYWORD_ALIASES[keyword])
  }
  return dedupe(expanded)
}

function collectTypes(source, rules, fallback = []) {
  const matched = []
  for (const rule of rules) {
    if (rule.keywords.some(keyword => source.includes(keyword))) {
      matched.push(rule.type)
    }
  }
  return dedupe(matched.length > 0 ? matched : fallback)
}

export function buildIntentProfile(intentQuery = '', intentSummary = '') {
  const source = normalizeText(`${intentQuery} ${intentSummary}`)
  const intentSource = normalizeText(intentQuery)
  const focusTopics = dedupe(
    source
      .split(/[，。；、\s]+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
  ).slice(0, 12)

  const entityTypes = collectTypes(source, ENTITY_RULES, ['人物', '组织', '地点', '设施', '国家', '概念'])
  const eventTypes = collectTypes(source, EVENT_RULES, ['军事打击', '外交谈判', '经济波动'])
  const includeKeywords = extractConstraintTerms(intentSource, INCLUDE_PATTERNS)
  const excludeKeywords = extractConstraintTerms(intentSource, EXCLUDE_PATTERNS)

  return {
    focusTopics,
    entityTypes,
    eventTypes,
    includeKeywords,
    includeKeywordAliases: expandKeywords(includeKeywords),
    excludeKeywords,
    excludeKeywordAliases: expandKeywords(excludeKeywords),
    allowedRelations: DEFAULT_RELATIONS,
    ignoreRules: ['共现噪音', '碎片词语', '重复短语', '无证据支撑节点'],
    extractionMode: eventTypes.length > 0 ? 'event-centric' : 'entity-centric',
    qaStyle: 'evidence-first',
    generatedAt: Date.now()
  }
}

function splitParagraphs(content = '') {
  return String(content || '')
    .split(/\n\s*\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function getIntentAliases(intentProfile = null, key = 'includeKeywordAliases') {
  return (Array.isArray(intentProfile?.[key]) ? intentProfile[key] : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function paragraphMatchesAliases(paragraph = '', aliases = []) {
  const text = String(paragraph || '').trim()
  if (!text || aliases.length === 0) return false
  return aliases.some(alias => alias && text.includes(alias))
}

export function focusContentByIntent(content = '', intentProfile = null) {
  const includeAliases = getIntentAliases(intentProfile)
  const paragraphs = splitParagraphs(content)

  if (includeAliases.length === 0) {
    return {
      content: String(content || ''),
      filtered: false,
      matchedParagraphs: paragraphs.length,
      totalParagraphs: paragraphs.length
    }
  }

  const matchedIndexes = paragraphs
    .map((paragraph, index) => (paragraphMatchesAliases(paragraph, includeAliases) ? index : -1))
    .filter(index => index >= 0)

  if (matchedIndexes.length === 0) {
    return {
      content: '',
      filtered: true,
      matchedParagraphs: 0,
      totalParagraphs: paragraphs.length
    }
  }

  return {
    content: matchedIndexes.map(index => paragraphs[index]).join('\n\n'),
    filtered: matchedIndexes.length !== paragraphs.length,
    matchedParagraphs: matchedIndexes.length,
    totalParagraphs: paragraphs.length
  }
}

function collectNodeText(node = {}) {
  const properties = node.properties || {}
  const aliases = Array.isArray(properties.aliases) ? properties.aliases : []
  return [
    node.label,
    node.type,
    ...aliases,
    properties.alias,
    properties.name,
    properties.summary,
    properties.trigger,
    properties.location,
    properties.time,
    properties.normalizedName
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
}

function nodeMatchesIntent(node, includeAliases = [], excludeAliases = []) {
  const text = collectNodeText(node)
  if (!text) return false
  if (excludeAliases.some(alias => alias && text.includes(alias))) return false
  if (includeAliases.length === 0) return true
  return includeAliases.some(alias => alias && text.includes(alias))
}

export function filterGraphByIntent(graph = {}, intentProfile = null) {
  const includeAliases = getIntentAliases(intentProfile)
  const excludeAliases = getIntentAliases(intentProfile, 'excludeKeywordAliases')
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []

  if (includeAliases.length === 0 && excludeAliases.length === 0) {
    return { nodes, edges }
  }

  const matchedLabels = new Set(
    nodes
      .filter(node => nodeMatchesIntent(node, includeAliases, excludeAliases))
      .map(node => String(node.label || '').trim())
      .filter(Boolean)
  )

  if (matchedLabels.size === 0 && includeAliases.length > 0) {
    return { nodes: [], edges: [] }
  }

  const keptEdges = edges.filter(edge => {
    const source = String(edge?.source || '').trim()
    const target = String(edge?.target || '').trim()
    return matchedLabels.has(source) || matchedLabels.has(target)
  })

  const keptLabels = new Set(matchedLabels)
  for (const edge of keptEdges) {
    keptLabels.add(String(edge?.source || '').trim())
    keptLabels.add(String(edge?.target || '').trim())
  }

  return {
    nodes: nodes.filter(node => keptLabels.has(String(node.label || '').trim())),
    edges: keptEdges
  }
}
