/**
 * LLM-driven entity & relation extraction for unstructured text.
 * Calls the configured LLM API to intelligently extract a knowledge graph
 * from plain text, falling back gracefully on errors.
 */
import { callLLM } from './llmApiService'

const MAX_TEXT_LENGTH = 4000

/**
 * Extract entities and relations from text using LLM.
 * @param {string} text       Plain text to extract from
 * @param {object} settings   Settings store (apiEndpoint, apiKey, etc.)
 * @returns {{ nodes: Array, edges: Array }}
 */
export async function extractWithLLM(text, settings) {
  const truncated = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH)
    : text

  const systemPrompt = settings.extractionPrompt || getDefaultPrompt()

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: truncated }
  ]

  const raw = await callLLM(settings, messages)
  return parseExtractionResult(raw)
}

/**
 * Parse the LLM response into { nodes, edges }.
 * Handles: raw JSON, markdown code blocks, Chinese punctuation,
 * trailing commas, and various formatting quirks.
 */
function parseExtractionResult(raw) {
  if (!raw || typeof raw !== 'string') {
    console.warn('[llmExtractor] LLM returned empty or non-string response')
    return { nodes: [], edges: [] }
  }

  let jsonStr = raw.trim()

  // Step 1: Extract content from markdown code block (case-insensitive language tag)
  const codeBlockMatch = jsonStr.match(/```[\w]*\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Step 2: If not starting with { or [, try to locate JSON object boundaries
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
  }

  // Step 3: Sanitize common LLM quirks before parsing
  jsonStr = sanitizeJson(jsonStr)

  // Step 4: Try parsing
  let data = tryParseJson(jsonStr)

  // Step 5: If failed, try extracting JSON from the original raw response
  if (!data) {
    // Try finding a balanced JSON object in the raw text
    const extracted = extractJsonObject(raw)
    if (extracted) {
      data = tryParseJson(sanitizeJson(extracted))
    }
  }

  if (!data) {
    console.warn('[llmExtractor] Failed to parse LLM response as JSON. Raw response (first 500 chars):', raw.slice(0, 500))
    return { nodes: [], edges: [] }
  }

  // Normalize the parsed data
  const nodes = Array.isArray(data.nodes) ? data.nodes.map(normalizeNode).filter(Boolean) : []
  const edges = Array.isArray(data.edges || data.relations || data.links)
    ? (data.edges || data.relations || data.links).map(normalizeEdge).filter(Boolean)
    : []

  if (nodes.length === 0 && edges.length === 0) {
    console.warn('[llmExtractor] Parsed JSON successfully but got 0 nodes and 0 edges. Parsed data:', data)
  }

  return { nodes, edges }
}

/**
 * Sanitize common JSON formatting issues from LLM output:
 * - Chinese punctuation (，→ , ：→ : "" → "")
 * - Trailing commas before ] or }
 * - Single quotes used as string delimiters
 */
function sanitizeJson(str) {
  // Replace Chinese punctuation only OUTSIDE of string values
  // (naive approach: replace all — works well in practice because
  // entity names inside quotes rarely use these as meaningful content)
  let result = str
    // Chinese full-width colon → ASCII colon (only in JSON structural positions)
    .replace(/"\s*：\s*/g, '": ')
    .replace(/：\s*"/g, ': "')
    .replace(/：\s*\[/g, ': [')
    .replace(/：\s*\{/g, ': {')
    .replace(/：\s*(\d)/g, ': $1')
    // Chinese full-width comma → ASCII comma in structural positions
    .replace(/"\s*，\s*"/g, '", "')
    .replace(/"\s*，\s*\{/g, '", {')
    .replace(/\}\s*，\s*\{/g, '}, {')
    .replace(/\]\s*，\s*"/g, '], "')
    .replace(/"\s*，\s*\[/g, '", [')
    // Chinese quotes → ASCII quotes
    .replace(/[\u201c\u201d\u2018\u2019]/g, '"')
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')

  return result
}

/**
 * Try to parse a string as JSON, returns null on failure.
 */
function tryParseJson(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * Extract the outermost balanced JSON object from a string.
 * Finds the first { and tracks brace depth to find matching }.
 */
function extractJsonObject(text) {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

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
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function normalizeNode(n) {
  if (!n || typeof n !== 'object') return null
  const label = (n.label || n.name || n.entity || '').trim()
  if (!label) return null
  return {
    label,
    type: (n.type || n.category || 'entity').trim(),
    properties: n.properties || {}
  }
}

function normalizeEdge(e) {
  if (!e || typeof e !== 'object') return null
  const source = (e.source || e.from || e.subject || e.head || '').trim()
  const target = (e.target || e.to || e.object || e.tail || '').trim()
  if (!source || !target) return null
  return {
    source,
    target,
    label: (e.label || e.relation || e.predicate || e.type || '').trim(),
    properties: e.properties || {}
  }
}

export function getDefaultPrompt() {
  return `你是一个知识图谱构建专家。请从以下文本中提取实体和关系。

要求：
1. 提取文本中的关键实体（人物、组织、地点、概念、技术、事件等）
2. 提取实体之间的关系
3. 以 JSON 格式返回，格式如下：
{
  "nodes": [{"label": "实体名", "type": "实体类型"}],
  "edges": [{"source": "实体1", "target": "实体2", "label": "关系"}]
}
4. 只返回 JSON，不要其他文字`
}
