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

const ALLOWED_ENTITY_TYPES = ['人物', '组织', '地点', '设施', '国家', '概念', '经济指标']
const ALLOWED_EVENT_TYPES = ['军事打击', '导弹行动', '外交谈判', '制裁施压', '航运风险', '经济波动', '政治变动']

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

const GENERIC_INTENT_TERMS = new Set([
  '表态', '行动', '影响', '动向', '局势', '动态', '情况', '问题', '事件', '资料', '信息',
  '内容', '主题', '范围', '对象', '相关', '后果', '变化', '消息', '趋势'
])

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
      .filter(item => !GENERIC_INTENT_TERMS.has(item))
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

function normalizeIntentKeyword(value = '') {
  return String(value || '')
    .replace(/局势|形势|动态|情况|问题|事件|资料|信息|专题|观察|分析|研究|相关$/g, '')
    .trim()
}

function deriveImplicitKeywords(intentSource = '', focusTopics = []) {
  const derived = []
  for (const aliasKey of Object.keys(KEYWORD_ALIASES)) {
    if (intentSource.includes(aliasKey)) derived.push(aliasKey)
  }

  for (const topic of focusTopics) {
    const normalized = normalizeIntentKeyword(topic)
    if (normalized.length >= 2 && !GENERIC_INTENT_TERMS.has(normalized)) derived.push(normalized)
  }

  return dedupe(derived)
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
  const explicitIncludeKeywords = extractConstraintTerms(intentSource, INCLUDE_PATTERNS)
  const includeKeywords = explicitIncludeKeywords.length > 0
    ? explicitIncludeKeywords
    : deriveImplicitKeywords(intentSource, focusTopics)
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

function formatPromptList(values = [], fallback = '无') {
  const items = Array.isArray(values)
    ? values.map(item => String(item || '').trim()).filter(Boolean)
    : []
  return items.length > 0 ? items.join('、') : fallback
}

function sanitizeJson(str) {
  return String(str || '')
    .replace(/[\u201c\u201d\u2018\u2019]/g, '"')
    .replace(/,\s*([}\]])/g, '$1')
}

function tryParseJson(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function extractJsonObject(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < source.length; index++) {
    const ch = source[index]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function normalizeStringArray(values = [], allowed = null, fallback = []) {
  const items = Array.isArray(values)
    ? values.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const normalized = allowed
    ? items.filter(item => allowed.includes(item))
    : items
  return dedupe(normalized.length > 0 ? normalized : fallback)
}

function normalizeIntentProfile(candidate = {}, baseProfile = {}) {
  return {
    ...baseProfile,
    focusTopics: normalizeStringArray(candidate.focusTopics, null, baseProfile.focusTopics || []),
    entityTypes: normalizeStringArray(candidate.entityTypes, ALLOWED_ENTITY_TYPES, baseProfile.entityTypes || []),
    eventTypes: normalizeStringArray(candidate.eventTypes, ALLOWED_EVENT_TYPES, baseProfile.eventTypes || []),
    includeKeywords: normalizeStringArray(candidate.includeKeywords, null, baseProfile.includeKeywords || []),
    excludeKeywords: normalizeStringArray(candidate.excludeKeywords, null, baseProfile.excludeKeywords || []),
    allowedRelations: normalizeStringArray(candidate.allowedRelations, DEFAULT_RELATIONS, baseProfile.allowedRelations || DEFAULT_RELATIONS),
    ignoreRules: normalizeStringArray(candidate.ignoreRules, null, baseProfile.ignoreRules || [])
  }
}

export function buildExtractionPrompt(intentQuery = '', intentSummary = '', intentProfile = null) {
  const profile = intentProfile || buildIntentProfile(intentQuery, intentSummary)
  const focusTopics = formatPromptList(profile.focusTopics, '围绕工作区意图判断')
  const entityTypes = formatPromptList(profile.entityTypes, '人物、组织、地点、设施、国家、概念')
  const eventTypes = formatPromptList(profile.eventTypes, '军事打击、外交谈判、经济波动')
  const allowedRelations = formatPromptList(profile.allowedRelations, '发起、执行、参与、针对、导致、回应')
  const includeKeywords = formatPromptList(profile.includeKeywords, '无强制限定')
  const excludeKeywords = formatPromptList(profile.excludeKeywords, '无')
  const intentLine = String(intentQuery || '').trim() || '未提供工作区意图'

  return `你是中文知识图谱抽取器，正在为一个工作区构建“实体 + 事件”图谱。

工作区总意图：${intentLine}
重点主题：${focusTopics}
重点实体类型：${entityTypes}
重点事件类型：${eventTypes}
允许关系类型：${allowedRelations}
必须优先保留的关键词：${includeKeywords}
需要忽略的关键词：${excludeKeywords}

执行要求：
1. 只抽取与工作区意图直接相关的实体、事件和关系，无关内容直接忽略。
2. 事件节点必须使用 type="事件"，并尽量抽成清晰的主谓宾或主谓结构。
3. 实体节点尽量稳定命名，避免生成碎片词、重复短语、无意义共现词。
4. 如果文本中没有足够证据支持某个节点或关系，不要猜测。
5. 输出必须是合法 JSON，对象格式固定为 { "nodes": [...], "edges": [...] }。

节点要求：
- 实体节点格式：{"label":"节点名","type":"人物|组织|地点|设施|国家|概念|经济指标"}
- 事件节点格式：{"label":"事件摘要","type":"事件","properties":{"predicate":"谓语","summary":"简短摘要"}}

关系要求：
- 只要关系涉及事件节点，label 必须从以下集合中选择：发起、执行、参与、指挥、针对、发生于、影响、支持、反对、宣布、导致、触发、升级、回应、依赖、推动、阻碍、停止。
- 实体到实体关系保持简短明确，不要生成“共现”“相关”这类噪声关系。

返回格式：
{
  "nodes": [
    {"label": "节点名", "type": "人物|组织|地点|设施|国家|概念|经济指标|事件", "properties": {}}
  ],
  "edges": [
    {"source": "节点1", "target": "节点2", "label": "关系", "properties": {}}
  ]
}`
}

function buildPromptGenerationMessages({ name = '', intentQuery = '', intentSummary = '', intentProfile = null }) {
  const profile = intentProfile || buildIntentProfile(intentQuery, intentSummary)

  return {
    profile,
    payload: {
      model: process.env.LLM_MODEL_NAME || 'MiniMax-M2.5',
      stream: false,
      temperature: 0.15,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: [
            '你是中文知识图谱抽取策略设计师。',
            '你的任务不是直接写提示词，而是根据工作区名称和意图，生成一份抽取策略 JSON。',
            '返回必须是单个合法 JSON 对象，不能输出 Markdown、解释、代码块或 <think>。',
            'JSON 只能包含以下键：focusTopics、entityTypes、eventTypes、includeKeywords、excludeKeywords、allowedRelations、ignoreRules。',
            `entityTypes 只能从以下集合中选择：${ALLOWED_ENTITY_TYPES.join('、')}。`,
            `eventTypes 只能从以下集合中选择：${ALLOWED_EVENT_TYPES.join('、')}。`,
            `allowedRelations 只能从以下集合中选择：${DEFAULT_RELATIONS.join('、')}。`,
            '请尽量围绕工作区意图收紧范围，避免泛化词。',
            '如果某个字段没有必要扩展，可以返回空数组。'
          ].join('')
        },
        {
          role: 'user',
          content: JSON.stringify({
            workspaceName: String(name || '').trim(),
            intentQuery: String(intentQuery || '').trim(),
            intentSummary: String(intentSummary || '').trim(),
            baseProfile: profile
          })
        }
      ]
    }
  }
}

export async function generateExtractionPrompt(intentQuery = '', intentSummary = '', options = {}) {
  const name = String(options.name || '').trim()
  const baseProfile = options.intentProfile || buildIntentProfile(intentQuery, intentSummary)
  const fallbackPrompt = buildExtractionPrompt(intentQuery, intentSummary, baseProfile)
  const apiKey = process.env.LLM_API_KEY || ''
  if (!apiKey) {
    return {
      extractionPrompt: fallbackPrompt,
      intentProfile: baseProfile,
      generator: 'template',
      usedFallback: true
    }
  }

  const baseUrl = (process.env.LLM_API_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/+$/, '')
  const { payload } = buildPromptGenerationMessages({
    name,
    intentQuery,
    intentSummary,
    intentProfile: baseProfile
  })

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    const rawText = await response.text()
    if (!response.ok) {
      throw new Error(`prompt generation failed: ${response.status} ${rawText}`)
    }

    const data = JSON.parse(rawText)
    const content = String(data?.choices?.[0]?.message?.content || '').trim()
    const extracted = extractJsonObject(content) || content
    const parsed = tryParseJson(sanitizeJson(extracted))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid profile from llm')
    }
    const mergedProfile = normalizeIntentProfile(parsed, baseProfile)

    return {
      extractionPrompt: buildExtractionPrompt(intentQuery, intentSummary, mergedProfile),
      intentProfile: {
        ...mergedProfile,
        includeKeywordAliases: expandKeywords(mergedProfile.includeKeywords),
        excludeKeywordAliases: expandKeywords(mergedProfile.excludeKeywords),
        extractionMode: mergedProfile.eventTypes.length > 0 ? 'event-centric' : 'entity-centric',
        qaStyle: 'evidence-first',
        generatedAt: Date.now()
      },
      generator: 'llm',
      usedFallback: false
    }
  } catch {
    return {
      extractionPrompt: fallbackPrompt,
      intentProfile: baseProfile,
      generator: 'template',
      usedFallback: true
    }
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
