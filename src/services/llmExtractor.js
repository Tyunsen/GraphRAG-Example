import { callLLM } from './llmApiService'

const MAX_TEXT_LENGTH = 4000
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
  ['瞄准', '针对'],
  ['发生于', '发生于'],
  ['发生在', '发生于'],
  ['位于', '发生于'],
  ['影响', '影响'],
  ['波及', '影响'],
  ['支持', '支持'],
  ['援助', '支持'],
  ['反对', '反对'],
  ['谴责', '反对'],
  ['宣布', '宣布'],
  ['表示', '宣布'],
  ['导致', '导致'],
  ['造成', '导致'],
  ['引发', '导致'],
  ['触发', '触发'],
  ['升级', '升级'],
  ['加剧', '升级'],
  ['回应', '回应'],
  ['报复', '回应'],
  ['依赖', '依赖'],
  ['基于', '依赖'],
  ['推动', '推动'],
  ['促进', '推动'],
  ['阻碍', '阻碍'],
  ['削弱', '阻碍'],
  ['停止', '停止'],
  ['终止', '停止'],
  ['结束', '停止']
]

export async function extractWithLLM(text, settings, options = {}) {
  const truncated = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH)
    : text

  const systemPrompt = settings.extractionPrompt || getDefaultPrompt(options)
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: truncated }
  ]

  const raw = await callLLM(settings, messages)
  return parseExtractionResult(raw)
}

function parseExtractionResult(raw) {
  if (!raw || typeof raw !== 'string') {
    console.warn('[llmExtractor] LLM returned empty or non-string response')
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

  jsonStr = sanitizeJson(jsonStr)

  let data = tryParseJson(jsonStr)
  if (!data) {
    const extracted = extractJsonObject(raw)
    if (extracted) {
      data = tryParseJson(sanitizeJson(extracted))
    }
  }

  if (!data) {
    console.warn('[llmExtractor] Failed to parse LLM response as JSON. Raw response (first 500 chars):', raw.slice(0, 500))
    return { nodes: [], edges: [] }
  }

  const nodes = Array.isArray(data.nodes)
    ? data.nodes.map(normalizeNode).filter(Boolean)
    : []
  const nodeTypeMap = new Map(nodes.map(node => [node.label, node.type]))

  const edges = Array.isArray(data.edges || data.relations || data.links)
    ? (data.edges || data.relations || data.links)
      .map(edge => normalizeEdge(edge, nodeTypeMap))
      .filter(Boolean)
    : []

  if (nodes.length === 0 && edges.length === 0) {
    console.warn('[llmExtractor] Parsed JSON successfully but got 0 nodes and 0 edges. Parsed data:', data)
  }

  return { nodes, edges }
}

function sanitizeJson(str) {
  return str
    .replace(/"\s*：\s*/g, '": ')
    .replace(/：\s*"/g, ': "')
    .replace(/：\s*\[/g, ': [')
    .replace(/：\s*\{/g, ': {')
    .replace(/：\s*(\d)/g, ': $1')
    .replace(/"\s*，\s*"/g, '", "')
    .replace(/"\s*，\s*\{/g, '", {')
    .replace(/\}\s*，\s*\{/g, '}, {')
    .replace(/\]\s*，\s*"/g, '], "')
    .replace(/"\s*，\s*\[/g, '", [')
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

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, index + 1)
    }
  }

  return null
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null
  const label = String(node.label || node.name || node.entity || '').trim()
  if (!label) return null

  const rawType = String(node.type || node.category || 'default').trim()
  const type = /事件|event/i.test(rawType) ? EVENT_TYPE : rawType

  return {
    label,
    type,
    properties: node.properties || {}
  }
}

function normalizeEdge(edge, nodeTypeMap) {
  if (!edge || typeof edge !== 'object') return null
  const source = String(edge.source || edge.from || edge.subject || edge.head || '').trim()
  const target = String(edge.target || edge.to || edge.object || edge.tail || '').trim()
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

function normalizeRelationLabel(label, sourceType, targetType) {
  const cleaned = label.trim()
  const eventInvolved = sourceType === EVENT_TYPE || targetType === EVENT_TYPE
  if (!eventInvolved) return cleaned || '关联'

  for (const [keyword, normalized] of EVENT_RELATION_KEYWORDS) {
    if (cleaned.includes(keyword)) return normalized
  }

  return EVENT_RELATION_LABELS.includes(cleaned) ? cleaned : '影响'
}

export function getDefaultPrompt(options = {}) {
  const intentBlock = options.workspaceIntent
    ? `当前工作区总意图：${options.workspaceIntent}\n请围绕这个意图抽取，不要做与意图无关的全量抽取。`
    : '如果未提供工作区意图，请仅提取与主题最核心的实体、事件和关系。'

  return `你是一个知识图谱构建专家，正在为一个工作区构建“实体 + 事件”混合图谱。

${intentBlock}

抽取要求：
1. 节点必须同时覆盖实体节点和事件节点。
2. 事件节点的 type 必须严格写成“事件”。
3. 事件节点要尽量表达成“谁在何处做了什么”的短语，例如“以色列空袭纳坦兹”“伊朗威胁封锁霍尔木兹海峡”。
4. 如果某段内容与工作区意图弱相关，可以忽略，不要为了凑数量硬抽。
5. 节点 label 必须短、稳定、可复用。
6. 只返回一个合法 JSON 对象，不要解释，不要 markdown，不要 <think>。

关系 schema：
1. 实体 -> 实体：可用简短关系词，例如“位于 / 属于 / 控制 / 会见 / 支持”。
2. 只要关系涉及事件节点，label 必须从下面枚举里选：
发起、执行、参与、指挥、针对、发生于、影响、支持、反对、宣布、导致、触发、升级、回应、依赖、推动、阻碍、停止
3. 事件 -> 事件 关系优先使用：导致、触发、升级、回应、推动、阻碍、停止。

返回格式：
{
  "nodes": [
    {"label": "节点名", "type": "人物|组织|地点|概念|事件|设施|国家|媒体|经济指标"}
  ],
  "edges": [
    {"source": "节点1", "target": "节点2", "label": "关系"}
  ]
}`
}
