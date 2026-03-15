import { sanitizeGraphLabel } from './graphSanitizer.js'

const MAX_TEXT_LENGTH = 6000
const EVENT_TYPE = '事件'
const EVENT_RELATION_LABELS = [
  '发起',
  '执行',
  '参与',
  '指挥',
  '针对',
  '发生于',
  '影响',
  '支持',
  '反对',
  '宣布',
  '导致',
  '触发',
  '升级',
  '回应',
  '依赖',
  '推动',
  '阻碍',
  '停止'
]

const EVENT_RELATION_KEYWORDS = [
  ['发起', '发起'],
  ['发动', '发起'],
  ['执行', '执行'],
  ['实施', '执行'],
  ['参与', '参与'],
  ['加入', '参与'],
  ['指挥', '指挥'],
  ['命令', '指挥'],
  ['针对', '针对'],
  ['袭击', '针对'],
  ['打击', '针对'],
  ['发生于', '发生于'],
  ['位于', '发生于'],
  ['影响', '影响'],
  ['波及', '影响'],
  ['支持', '支持'],
  ['援助', '支持'],
  ['反对', '反对'],
  ['宣布', '宣布'],
  ['导致', '导致'],
  ['造成', '导致'],
  ['引发', '导致'],
  ['触发', '触发'],
  ['升级', '升级'],
  ['加剧', '升级'],
  ['回应', '回应'],
  ['报复', '回应'],
  ['依赖', '依赖'],
  ['推动', '推动'],
  ['促进', '推动'],
  ['阻碍', '阻碍'],
  ['削弱', '阻碍'],
  ['停止', '停止'],
  ['终止', '停止'],
  ['结束', '停止']
]

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
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < text.length; index++) {
    const ch = text[index]

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
      if (depth === 0) return text.slice(start, index + 1)
    }
  }

  return null
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null
  const rawType = String(node.type || node.category || 'default').trim()
  const type = /事件|event/i.test(rawType) ? EVENT_TYPE : rawType || 'default'
  const label = sanitizeGraphLabel(node.label || node.name || node.entity || '', type)
  if (!label) return null
  return {
    label,
    type,
    properties: node.properties || {}
  }
}

function normalizeRelationLabel(label, sourceType, targetType) {
  const cleaned = String(label || '').trim()
  const eventInvolved = sourceType === EVENT_TYPE || targetType === EVENT_TYPE
  if (!eventInvolved) return cleaned || '关联'

  for (const [keyword, normalized] of EVENT_RELATION_KEYWORDS) {
    if (cleaned.includes(keyword)) return normalized
  }

  return EVENT_RELATION_LABELS.includes(cleaned) ? cleaned : '影响'
}

function normalizeEdge(edge, nodeTypeMap) {
  if (!edge || typeof edge !== 'object') return null
  const rawSource = String(edge.source || edge.from || edge.subject || edge.head || '').trim()
  const rawTarget = String(edge.target || edge.to || edge.object || edge.tail || '').trim()
  const source = sanitizeGraphLabel(rawSource, nodeTypeMap.get(rawSource) || '')
  const target = sanitizeGraphLabel(rawTarget, nodeTypeMap.get(rawTarget) || '')
  if (!source || !target) return null

  const sourceType = nodeTypeMap.get(source) || ''
  const targetType = nodeTypeMap.get(target) || ''
  const rawLabel = String(edge.label || edge.relation || edge.predicate || edge.type || '').trim()
  return {
    source,
    target,
    label: normalizeRelationLabel(rawLabel, sourceType, targetType),
    properties: edge.properties || {}
  }
}

function parseExtractionResult(raw) {
  if (!raw || typeof raw !== 'string') {
    return { nodes: [], edges: [] }
  }

  let jsonStr = raw.trim()
  const codeBlockMatch = jsonStr.match(/```[\w]*\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
  }

  let data = tryParseJson(sanitizeJson(jsonStr))
  if (!data) {
    const extracted = extractJsonObject(raw)
    if (extracted) {
      data = tryParseJson(sanitizeJson(extracted))
    }
  }
  if (!data) return { nodes: [], edges: [] }

  const nodes = Array.isArray(data.nodes)
    ? data.nodes.map(normalizeNode).filter(Boolean)
    : []
  const nodeTypeMap = new Map(nodes.map(node => [node.label, node.type]))
  const rawEdges = data.edges || data.relations || data.links || []
  const edges = Array.isArray(rawEdges)
    ? rawEdges.map(edge => normalizeEdge(edge, nodeTypeMap)).filter(Boolean)
    : []

  return { nodes, edges }
}

export function getDefaultServerPrompt({ workspaceIntent = '', extractionProfile = null } = {}) {
  const profileLine = extractionProfile
    ? `重点实体类型：${(extractionProfile.entityTypes || []).join('、') || '无'}；重点事件类型：${(extractionProfile.eventTypes || []).join('、') || '无'}；允许关系：${(extractionProfile.allowedRelations || []).join('、') || '无'}。`
    : ''

  const intentLine = workspaceIntent
    ? `当前工作区总意图：${workspaceIntent}。请围绕这个意图抽取，不要做无关的全量抽取。`
    : '如果没有提供工作区意图，只保留最核心的实体、事件和关系。'

  return `你是知识图谱抽取器，正在为一个中文工作区构建“实体 + 事件”图谱。
${intentLine}
${profileLine}

要求：
1. 节点必须覆盖实体节点和事件节点。
2. 事件节点的 type 必须写成“事件”。
3. 事件节点尽量写成短而稳定的动作短语，例如“以色列空袭纳坦兹核设施”“伊朗威胁封锁霍尔木兹海峡”。
4. 如果文本与工作区意图关系很弱，可以忽略，不要为了凑数量乱抽。
5. 只返回一个合法 JSON 对象，不要 markdown，不要解释，不要 <think>。

关系规则：
1. 实体到实体可以使用简短关系词。
2. 只要关系涉及事件节点，label 必须从以下集合选择：
发起、执行、参与、指挥、针对、发生于、影响、支持、反对、宣布、导致、触发、升级、回应、依赖、推动、阻碍、停止

返回格式：
{
  "nodes": [
    {"label": "节点名", "type": "人物|组织|地点|设施|国家|概念|经济指标|事件"}
  ],
  "edges": [
    {"source": "节点1", "target": "节点2", "label": "关系"}
  ]
}`
}

export async function extractWithServerLLM(text, options = {}) {
  const baseUrl = (process.env.LLM_API_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/+$/, '')
  const apiKey = process.env.LLM_API_KEY || ''
  const model = options.modelName || process.env.LLM_MODEL_NAME || 'MiniMax-M2.5'

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured on server.')
  }

  const prompt = options.promptOverride || getDefaultServerPrompt(options)
  const payload = {
    model,
    stream: false,
    temperature: Number(options.temperature ?? 0.2),
    max_tokens: Number(options.maxTokens ?? 1600),
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: String(text || '').slice(0, MAX_TEXT_LENGTH) }
    ]
  }

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
    throw new Error(`LLM request failed (${response.status}): ${rawText}`)
  }

  const parsed = tryParseJson(rawText)
  const content = parsed?.choices?.[0]?.message?.content || rawText
  return parseExtractionResult(content)
}
