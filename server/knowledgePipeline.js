import { createHash } from 'crypto'

const EVENT_NODE_TYPE = '事件'
const AGENT_RELATIONS = new Set(['发起', '执行', '参与', '宣布', '支持', '领导', '指挥'])
const OBJECT_RELATIONS = new Set(['针对', '受影响', '造成', '影响', '打击'])
const LOCATION_RELATIONS = new Set(['发生于', '位于'])
const DEFAULT_RELATION = '关联'

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function uniqueIntegers(values = []) {
  return [...new Set(values.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b)
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNodeType(type = '') {
  return /事件|event/i.test(String(type || '').trim()) ? EVENT_NODE_TYPE : String(type || 'default').trim() || 'default'
}

function normalizeRelationLabel(label = '') {
  return String(label || '').trim() || DEFAULT_RELATION
}

function pickLongestText(values = []) {
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || ''
}

function pickMostFrequent(values = []) {
  const counter = new Map()
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text) continue
    counter.set(text, (counter.get(text) || 0) + 1)
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([text]) => text)[0] || ''
}

function mergeProperties(base = {}, next = {}) {
  const output = { ...base }
  for (const [key, value] of Object.entries(next || {})) {
    if (value == null) continue

    if (Array.isArray(value)) {
      const existing = Array.isArray(output[key]) ? output[key] : []
      output[key] = dedupe([...existing, ...value.map(item => String(item || '').trim())])
      continue
    }

    if (isObject(value)) {
      output[key] = { ...(isObject(output[key]) ? output[key] : {}), ...value }
      continue
    }

    const nextText = String(value).trim()
    if (!nextText) continue
    const currentText = String(output[key] || '').trim()
    output[key] = nextText.length >= currentText.length ? value : output[key]
  }
  return output
}

export function normalizeLabel(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizeAliasToken(value = '') {
  let text = normalizeLabel(value)
    .replace(/[()（）【】\[\]{}<>《》"'`“”‘’.,，。:：;；!?！？/\-_\s]+/g, '')

  const removableSuffixes = [
    '伊斯兰共和国',
    '共和国',
    '有限公司',
    '股份有限公司',
    '集团',
    '公司',
    '政府',
    '当局',
    '方面',
    '武装力量',
    '部队',
    '组织',
    '集团军',
    '军方',
    '方面',
    'the',
    'government',
    'administration',
    'agency',
    'group',
    'company',
    'corp',
    'inc',
    'ltd'
  ]

  for (const suffix of removableSuffixes) {
    if (text.length <= suffix.length + 2) continue
    if (text.endsWith(suffix)) {
      text = text.slice(0, -suffix.length)
      break
    }
  }

  return text || normalizeLabel(value)
}

function normalizeTimeToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/[年/月日号点时分秒\s]+/g, '')
    .slice(0, 24)
}

function normalizeLocationToken(value = '') {
  return normalizeAliasToken(value).slice(0, 32)
}

function normalizeActorKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^entity:/, '')
}

function canonicalizeEntityKey(label, nodeType, properties = {}) {
  const candidates = [
    label,
    ...(Array.isArray(properties.aliases) ? properties.aliases : []),
    properties.alias,
    properties.normalizedName,
    properties.name
  ]
  const normalizedCandidates = candidates
    .map(item => normalizeAliasToken(item))
    .filter(Boolean)

  const best = normalizedCandidates.sort((a, b) => b.length - a.length)[0] || normalizeAliasToken(label)
  return `${nodeType === EVENT_NODE_TYPE ? 'event' : 'entity'}:${best}`
}

function canonicalizeEventKey({
  label = '',
  eventType = '',
  trigger = '',
  subjectKeys = [],
  objectKeys = [],
  timeText = '',
  locationText = ''
}) {
  const normalizedType = normalizeAliasToken(eventType || '一般事件')
  const normalizedTrigger = normalizeAliasToken(trigger || label)
  const subjects = subjectKeys
    .map(item => normalizeActorKey(item))
    .filter(Boolean)
    .sort()
    .slice(0, 3)
  const objects = objectKeys
    .map(item => normalizeActorKey(item))
    .filter(Boolean)
    .sort()
    .slice(0, 3)
  const normalizedTime = normalizeTimeToken(timeText)
  const normalizedLocation = normalizeLocationToken(locationText)

  const parts = [
    normalizedType || 'event',
    normalizedTrigger || normalizeAliasToken(label),
    subjects.join('+'),
    objects.join('+'),
    normalizedLocation,
    normalizedTime
  ].filter(Boolean)

  return `event:${parts.join('|')}`
}

function parseJsonArray(value) {
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

function canonicalKeyToToken(key = '') {
  return String(key || '')
    .trim()
    .replace(/^(entity|event):/i, '')
}

function toBigrams(value = '') {
  const text = String(value || '').trim()
  if (!text) return new Set()
  if (text.length < 2) return new Set([text])

  const grams = new Set()
  for (let index = 0; index < text.length - 1; index++) {
    grams.add(text.slice(index, index + 2))
  }
  return grams
}

function overlapRatio(left = [], right = []) {
  const leftSet = new Set(left.filter(Boolean))
  const rightSet = new Set(right.filter(Boolean))
  if (leftSet.size === 0 || rightSet.size === 0) return 0

  let overlap = 0
  for (const item of leftSet) {
    if (rightSet.has(item)) overlap += 1
  }
  return overlap / Math.max(leftSet.size, rightSet.size)
}

function textSimilarity(left = '', right = '') {
  const a = normalizeAliasToken(left)
  const b = normalizeAliasToken(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) {
    const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length)
    return 0.82 + (lengthRatio * 0.12)
  }

  const aBigrams = toBigrams(a)
  const bBigrams = toBigrams(b)
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0

  let overlap = 0
  for (const gram of aBigrams) {
    if (bBigrams.has(gram)) overlap += 1
  }

  return overlap / Math.max(aBigrams.size, bBigrams.size)
}

function isGenericEntityType(entityType = '') {
  const type = String(entityType || '').trim()
  return !type || type === 'default' || type === '概念'
}

function areEntityTypesCompatible(left = '', right = '') {
  if (left === right) return true
  if (isGenericEntityType(left) || isGenericEntityType(right)) return true
  return false
}

function buildEntitySignal(row) {
  const properties = parseJson(row.properties, {})
  const aliasCandidates = [
    row.mentionText,
    row.label,
    canonicalKeyToToken(row.canonicalKey),
    ...(Array.isArray(properties.aliases) ? properties.aliases : []),
    properties.alias,
    properties.normalizedName,
    properties.name
  ]

  const tokens = dedupe(aliasCandidates
    .map(item => normalizeAliasToken(item))
    .filter(item => item && item.length >= 2))
    .sort((a, b) => b.length - a.length)

  return {
    row,
    type: String(row.entityType || 'default').trim() || 'default',
    label: String(row.mentionText || '').trim(),
    tokens,
    primaryToken: tokens[0] || normalizeAliasToken(row.mentionText)
  }
}

function scoreEntityCluster(cluster, signal) {
  if (cluster.sourceKeys.has(signal.row.canonicalKey)) return 1
  if (!areEntityTypesCompatible(cluster.type, signal.type)) return 0

  let best = 0
  for (const token of signal.tokens) {
    if (!token) continue
    if (cluster.tokens.has(token)) return 0.98

    for (const clusterToken of cluster.tokens) {
      const score = textSimilarity(token, clusterToken)
      if (score > best) best = score
    }
  }

  return best
}

function makeEntityCluster(signal) {
  return {
    sourceKeys: new Set([signal.row.canonicalKey]),
    rows: [signal.row],
    tokens: new Set(signal.tokens),
    typeVotes: [signal.type],
    type: signal.type
  }
}

function mergeEntitySignal(cluster, signal) {
  cluster.sourceKeys.add(signal.row.canonicalKey)
  cluster.rows.push(signal.row)
  signal.tokens.forEach(token => cluster.tokens.add(token))
  cluster.typeVotes.push(signal.type)
  cluster.type = pickMostFrequent(cluster.typeVotes) || cluster.type
}

function clusterEntityRows(entityRows = []) {
  const clusters = []
  const keyAliasMap = new Map()

  for (const row of entityRows) {
    const signal = buildEntitySignal(row)
    if (!signal.primaryToken) continue

    let bestCluster = null
    let bestScore = 0
    for (const cluster of clusters) {
      const score = scoreEntityCluster(cluster, signal)
      if (score > bestScore) {
        bestScore = score
        bestCluster = cluster
      }
    }

    if (!bestCluster || bestScore < 0.88) {
      bestCluster = makeEntityCluster(signal)
      clusters.push(bestCluster)
    } else {
      mergeEntitySignal(bestCluster, signal)
    }
  }

  for (const cluster of clusters) {
    const labels = cluster.rows.map(row => row.mentionText)
    const label = pickMostFrequent(labels)
    const type = pickMostFrequent(cluster.typeVotes) || 'default'
    const finalKey = canonicalizeEntityKey(label, type, {
      aliases: [...cluster.tokens]
    })
    cluster.finalKey = finalKey
    cluster.label = label
    cluster.type = type

    for (const row of cluster.rows) {
      keyAliasMap.set(row.canonicalKey, finalKey)
    }
  }

  return { clusters, keyAliasMap }
}

function buildEventSignal(row, entityKeyAliasMap = new Map()) {
  const subjectKeys = dedupe(parseJsonArray(row.subjectKeys)
    .map(item => entityKeyAliasMap.get(item) || item)
    .filter(Boolean))
    .sort()
  const objectKeys = dedupe(parseJsonArray(row.objectKeys)
    .map(item => entityKeyAliasMap.get(item) || item)
    .filter(Boolean))
    .sort()

  return {
    row,
    label: String(row.label || '').trim(),
    eventType: normalizeAliasToken(row.eventType || '一般事件'),
    trigger: normalizeAliasToken(row.trigger || row.predicateText || row.label),
    subjectKeys,
    objectKeys,
    locationText: normalizeLocationToken(row.locationText),
    timeText: normalizeTimeToken(row.timeText),
    summaryToken: normalizeAliasToken(row.summary || row.label)
  }
}

function scoreEventCluster(cluster, signal) {
  if (cluster.sourceKeys.has(signal.row.canonicalKey)) return 1

  let score = 0
  if (cluster.eventType === signal.eventType) score += 0.28
  else if (cluster.eventType === normalizeAliasToken('一般事件') || signal.eventType === normalizeAliasToken('一般事件')) score += 0.1
  else return 0

  const triggerScore = Math.max(
    textSimilarity(cluster.trigger, signal.trigger),
    textSimilarity(cluster.label, signal.label),
    textSimilarity(cluster.summaryToken, signal.summaryToken)
  )
  if (triggerScore >= 0.92) score += 0.34
  else if (triggerScore >= 0.7) score += 0.24
  else if (triggerScore >= 0.55) score += 0.14
  else return 0

  const subjectOverlap = overlapRatio(cluster.subjectKeys, signal.subjectKeys)
  const objectOverlap = overlapRatio(cluster.objectKeys, signal.objectKeys)
  if (subjectOverlap > 0) score += 0.18 * subjectOverlap
  if (objectOverlap > 0) score += 0.14 * objectOverlap

  if (cluster.locationText && signal.locationText && cluster.locationText === signal.locationText) score += 0.08
  if (cluster.timeText && signal.timeText && cluster.timeText === signal.timeText) score += 0.08

  if (!signal.subjectKeys.length && !signal.objectKeys.length && triggerScore >= 0.82) score += 0.08

  return score
}

function makeEventCluster(signal) {
  return {
    sourceKeys: new Set([signal.row.canonicalKey]),
    rows: [signal.row],
    eventTypeVotes: [signal.eventType],
    triggerVotes: [signal.trigger],
    labelVotes: [signal.label],
    summaryTokens: [signal.summaryToken],
    subjectKeys: [...signal.subjectKeys],
    objectKeys: [...signal.objectKeys],
    locationVotes: signal.locationText ? [signal.locationText] : [],
    timeVotes: signal.timeText ? [signal.timeText] : [],
    eventType: signal.eventType,
    trigger: signal.trigger,
    label: signal.label,
    summaryToken: signal.summaryToken,
    locationText: signal.locationText,
    timeText: signal.timeText
  }
}

function mergeEventSignal(cluster, signal) {
  cluster.sourceKeys.add(signal.row.canonicalKey)
  cluster.rows.push(signal.row)
  cluster.eventTypeVotes.push(signal.eventType)
  cluster.triggerVotes.push(signal.trigger)
  cluster.labelVotes.push(signal.label)
  if (signal.summaryToken) cluster.summaryTokens.push(signal.summaryToken)
  cluster.subjectKeys = dedupe([...cluster.subjectKeys, ...signal.subjectKeys]).sort()
  cluster.objectKeys = dedupe([...cluster.objectKeys, ...signal.objectKeys]).sort()
  if (signal.locationText) cluster.locationVotes.push(signal.locationText)
  if (signal.timeText) cluster.timeVotes.push(signal.timeText)
  cluster.eventType = pickMostFrequent(cluster.eventTypeVotes) || cluster.eventType
  cluster.trigger = pickMostFrequent(cluster.triggerVotes) || cluster.trigger
  cluster.label = pickMostFrequent(cluster.labelVotes) || cluster.label
  cluster.summaryToken = pickMostFrequent(cluster.summaryTokens) || cluster.summaryToken
  cluster.locationText = pickMostFrequent(cluster.locationVotes) || cluster.locationText
  cluster.timeText = pickMostFrequent(cluster.timeVotes) || cluster.timeText
}

function clusterEventRows(eventRows = [], entityKeyAliasMap = new Map()) {
  const clusters = []
  const keyAliasMap = new Map()

  for (const row of eventRows) {
    const signal = buildEventSignal(row, entityKeyAliasMap)
    if (!signal.label) continue

    let bestCluster = null
    let bestScore = 0
    for (const cluster of clusters) {
      const score = scoreEventCluster(cluster, signal)
      if (score > bestScore) {
        bestScore = score
        bestCluster = cluster
      }
    }

    if (!bestCluster || bestScore < 0.62) {
      bestCluster = makeEventCluster(signal)
      clusters.push(bestCluster)
    } else {
      mergeEventSignal(bestCluster, signal)
    }
  }

  for (const cluster of clusters) {
    const label = pickMostFrequent(cluster.rows.map(row => row.label))
    const eventType = pickMostFrequent(cluster.rows.map(row => row.eventType)) || '一般事件'
    const trigger = pickMostFrequent(cluster.rows.map(row => row.trigger)) || label
    const timeText = pickMostFrequent(cluster.rows.map(row => row.timeText).filter(Boolean))
    const locationText = pickMostFrequent(cluster.rows.map(row => row.locationText).filter(Boolean))
    const subjectKeys = dedupe(cluster.rows.flatMap(row => parseJsonArray(row.subjectKeys)
      .map(item => entityKeyAliasMap.get(item) || item))).sort()
    const objectKeys = dedupe(cluster.rows.flatMap(row => parseJsonArray(row.objectKeys)
      .map(item => entityKeyAliasMap.get(item) || item))).sort()
    const finalKey = canonicalizeEventKey({
      label,
      eventType,
      trigger,
      subjectKeys,
      objectKeys,
      timeText,
      locationText
    })
    cluster.finalKey = finalKey

    for (const row of cluster.rows) {
      keyAliasMap.set(row.canonicalKey, finalKey)
    }
  }

  return { clusters, keyAliasMap }
}

export function makeStableId(prefix, value) {
  const digest = createHash('md5').update(String(value || '')).digest('hex').slice(0, 16)
  return `${prefix}_${digest}`
}

export function splitIntoParagraphs(content = '') {
  const normalized = String(content || '').replace(/\r\n/g, '\n')
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)

  if (paragraphs.length > 0) return paragraphs

  return normalized
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean)
}

export function buildSegments(paragraphs = [], maxChars = 1000) {
  const segments = []
  let currentContent = []
  let currentParagraphIndexes = []
  let currentLength = 0
  let segmentIndex = 1

  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = String(paragraphs[index] || '').trim()
    if (!paragraph) continue

    const nextLength = currentLength + paragraph.length + (currentContent.length > 0 ? 2 : 0)
    if (currentContent.length > 0 && nextLength > maxChars) {
      segments.push({
        id: '',
        segmentIndex,
        paragraphIndexes: [...currentParagraphIndexes],
        content: currentContent.join('\n\n')
      })
      segmentIndex += 1
      currentContent = []
      currentParagraphIndexes = []
      currentLength = 0
    }

    currentContent.push(paragraph)
    currentParagraphIndexes.push(index + 1)
    currentLength += paragraph.length + (currentContent.length > 1 ? 2 : 0)
  }

  if (currentContent.length > 0) {
    segments.push({
      id: '',
      segmentIndex,
      paragraphIndexes: [...currentParagraphIndexes],
      content: currentContent.join('\n\n')
    })
  }

  return segments
}

function inferEventType(label = '', fallback = '') {
  const text = `${label} ${fallback}`.trim()
  if (!text) return '一般事件'
  if (/空袭|轰炸|打击|袭击/.test(text)) return '军事打击'
  if (/导弹|发射|拦截/.test(text)) return '导弹行动'
  if (/制裁|施压/.test(text)) return '制裁施压'
  if (/谈判|停火|会谈/.test(text)) return '外交谈判'
  if (/油价|经济|航运|海峡/.test(text)) return '经济波动'
  if (/领导|继任|政权/.test(text)) return '政治变动'
  return fallback || '一般事件'
}

function coerceStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }
  const text = String(value || '').trim()
  return text ? [text] : []
}

function buildPreparedNodes(extractedNodes = [], extractedEdges = []) {
  const nodeMap = new Map()

  for (const node of extractedNodes || []) {
    const label = String(node?.label || '').trim()
    if (!label) continue

    const type = normalizeNodeType(node.type)
    const properties = isObject(node.properties) ? node.properties : {}
    const existing = nodeMap.get(label)

    if (!existing) {
      nodeMap.set(label, { label, type, properties })
      continue
    }

    existing.type = existing.type === 'default' ? type : existing.type
    existing.properties = mergeProperties(existing.properties, properties)
  }

  for (const edge of extractedEdges || []) {
    const source = String(edge?.source || '').trim()
    const target = String(edge?.target || '').trim()
    if (source && !nodeMap.has(source)) nodeMap.set(source, { label: source, type: 'default', properties: {} })
    if (target && !nodeMap.has(target)) nodeMap.set(target, { label: target, type: 'default', properties: {} })
  }

  for (const node of [...nodeMap.values()]) {
    if (node.type !== EVENT_NODE_TYPE) continue
    const properties = node.properties || {}

    for (const label of [
      ...coerceStringArray(properties.subject),
      ...coerceStringArray(properties.object),
      ...coerceStringArray(properties.location)
    ]) {
      if (!label || nodeMap.has(label)) continue
      nodeMap.set(label, { label, type: 'default', properties: {} })
    }
  }

  return [...nodeMap.values()]
}

function buildMentionsByParagraphMap() {
  return new Map()
}

function pushMentionRef(mentionsByParagraph, paragraphRefs, kind, label) {
  for (const paragraphIndex of paragraphRefs) {
    if (!mentionsByParagraph.has(paragraphIndex)) {
      mentionsByParagraph.set(paragraphIndex, { entities: [], events: [] })
    }

    if (kind === 'event') mentionsByParagraph.get(paragraphIndex).events.push(label)
    else mentionsByParagraph.get(paragraphIndex).entities.push(label)
  }
}

function findParagraphRefs(paragraphs, label, fallback = []) {
  const refs = []
  const target = String(label || '').trim()
  if (!target) return uniqueIntegers(fallback)

  for (let index = 0; index < paragraphs.length; index++) {
    if (paragraphs[index].includes(target)) refs.push(index + 1)
  }

  return uniqueIntegers(refs.length > 0 ? refs : fallback)
}

function buildSegmentRows(graphId, fileId, fileName, segments, mentionsByParagraph, importedAt) {
  return segments.map(segment => {
    const entityLabels = []
    const eventLabels = []

    for (const paragraphIndex of segment.paragraphIndexes) {
      const bucket = mentionsByParagraph.get(paragraphIndex)
      if (!bucket) continue
      entityLabels.push(...bucket.entities)
      eventLabels.push(...bucket.events)
    }

    return {
      id: `${fileId}_segment_${segment.segmentIndex}`,
      graphId,
      fileId,
      fileName,
      paragraphIndex: segment.paragraphIndexes[0] || segment.segmentIndex,
      content: segment.content,
      linkedNodes: JSON.stringify(dedupe(entityLabels)),
      linkedEvents: JSON.stringify(dedupe(eventLabels)),
      importedAt,
      chunkKind: 'segment',
      segmentIndex: segment.segmentIndex,
      parentChunkId: ''
    }
  })
}

function buildParagraphRows(graphId, fileId, fileName, paragraphs, mentionsByParagraph, importedAt) {
  return paragraphs.map((paragraph, index) => {
    const paragraphIndex = index + 1
    const bucket = mentionsByParagraph.get(paragraphIndex) || { entities: [], events: [] }

    return {
      id: `${fileId}_paragraph_${paragraphIndex}`,
      graphId,
      fileId,
      fileName,
      paragraphIndex,
      content: paragraph,
      linkedNodes: JSON.stringify(dedupe(bucket.entities)),
      linkedEvents: JSON.stringify(dedupe(bucket.events)),
      importedAt,
      chunkKind: 'paragraph',
      segmentIndex: 0,
      parentChunkId: ''
    }
  })
}

function findSegmentIdForParagraphRefs(segmentRows, paragraphRefs = []) {
  const sortedRefs = uniqueIntegers(paragraphRefs)
  for (const row of segmentRows) {
    const indexes = Array.isArray(row.paragraphIndexes) ? row.paragraphIndexes : []
    if (indexes.some(index => sortedRefs.includes(index))) return row.id
  }
  return segmentRows[0]?.id || ''
}

function collectRelationIndex(edges = [], nodeTypeMap = new Map()) {
  const inbound = new Map()
  const outbound = new Map()

  for (const edge of edges) {
    const source = String(edge?.source || '').trim()
    const target = String(edge?.target || '').trim()
    if (!source || !target) continue

    const normalized = {
      source,
      target,
      label: normalizeRelationLabel(edge.label),
      properties: isObject(edge.properties) ? edge.properties : {},
      sourceType: normalizeNodeType(nodeTypeMap.get(source) || ''),
      targetType: normalizeNodeType(nodeTypeMap.get(target) || '')
    }

    if (!outbound.has(source)) outbound.set(source, [])
    if (!inbound.has(target)) inbound.set(target, [])
    outbound.get(source).push(normalized)
    inbound.get(target).push(normalized)
  }

  return { inbound, outbound }
}

export function buildKnowledgeRecords(
  graphId,
  fileId,
  fileName,
  content,
  extractedNodes = [],
  extractedEdges = [],
  now = Date.now()
) {
  const paragraphs = splitIntoParagraphs(content)
  const preparedNodes = buildPreparedNodes(extractedNodes, extractedEdges)
  const nodeTypeMap = new Map(preparedNodes.map(node => [node.label, normalizeNodeType(node.type)]))
  const relationIndex = collectRelationIndex(extractedEdges, nodeTypeMap)
  const mentionsByParagraph = buildMentionsByParagraphMap()

  const segments = buildSegments(paragraphs).map(segment => ({
    ...segment,
    id: `${fileId}_segment_${segment.segmentIndex}`
  }))

  const entityMentions = []
  const eventMentions = []
  const relationMentions = []
  const paragraphRefsByNode = new Map()
  const nodeKeyByLabel = new Map()
  const fileNodes = []
  const fileEdges = []
  const fileEdgeIds = new Set()

  for (const node of preparedNodes) {
    const label = String(node.label || '').trim()
    if (!label) continue

    const nodeType = normalizeNodeType(node.type)
    const paragraphRefs = findParagraphRefs(paragraphs, label, [])
    const chunkId = findSegmentIdForParagraphRefs(segments, paragraphRefs)
    paragraphRefsByNode.set(label, paragraphRefs)
    if (nodeType === EVENT_NODE_TYPE) {
      const inbound = relationIndex.inbound.get(label) || []
      const outbound = relationIndex.outbound.get(label) || []
      const properties = isObject(node.properties) ? node.properties : {}

      const subjectKeys = dedupe([
        ...inbound
          .filter(edge => edge.sourceType !== EVENT_NODE_TYPE && AGENT_RELATIONS.has(edge.label))
          .map(edge => `entity:${normalizeAliasToken(edge.source)}`),
        ...coerceStringArray(properties.subject).map(item => `entity:${normalizeAliasToken(item)}`)
      ])

      const objectKeys = dedupe([
        ...outbound
          .filter(edge => edge.targetType !== EVENT_NODE_TYPE && OBJECT_RELATIONS.has(edge.label))
          .map(edge => `entity:${normalizeAliasToken(edge.target)}`),
        ...coerceStringArray(properties.object).map(item => `entity:${normalizeAliasToken(item)}`)
      ])

      const eventType = inferEventType(label, String(properties.eventType || '').trim())
      const trigger = String(properties.trigger || label).trim()
      const predicateText = String(properties.predicate || pickMostFrequent([
        ...outbound.map(edge => edge.label),
        ...inbound.map(edge => edge.label)
      ]) || trigger).trim()
      const locationText = String(
        properties.location ||
        pickLongestText(outbound
          .filter(edge => edge.targetType !== EVENT_NODE_TYPE && LOCATION_RELATIONS.has(edge.label))
          .map(edge => edge.target))
      ).trim()
      const timeText = String(
        properties.time ||
        properties.date ||
        properties.occurredAt ||
        ''
      ).trim()
      const summary = String(properties.summary || label).trim()
      const canonicalKey = canonicalizeEventKey({
        label,
        eventType,
        trigger,
        subjectKeys,
        objectKeys,
        timeText,
        locationText
      })
      nodeKeyByLabel.set(label, canonicalKey)

      eventMentions.push({
        id: makeStableId('em', `${fileId}|${canonicalKey}|${label}|${paragraphRefs.join(',')}`),
        graphId,
        fileId,
        fileName,
        canonicalKey,
        label,
        eventType,
        trigger,
        summary,
        subjectKeys: JSON.stringify(subjectKeys),
        predicateText,
        objectKeys: JSON.stringify(objectKeys),
        timeText,
        locationText,
        paragraphRefs: JSON.stringify(paragraphRefs),
        chunkId,
        properties: JSON.stringify(properties),
        confidence: Number(properties.confidence || 0.85),
        createdAt: now
      })

      pushMentionRef(mentionsByParagraph, paragraphRefs, 'event', label)
      fileNodes.push({
        id: makeStableId('fn', `${fileId}|${label}`),
        graphId,
        fileId,
        fileName,
        nodeLabel: label,
        nodeType: EVENT_NODE_TYPE,
        nodeProperties: JSON.stringify({
          ...properties,
          eventType,
          trigger,
          summary
        }),
        createdAt: now
      })

      continue
    }

    const properties = isObject(node.properties) ? node.properties : {}
    const canonicalKey = canonicalizeEntityKey(label, nodeType, properties)
    nodeKeyByLabel.set(label, canonicalKey)
    entityMentions.push({
      id: makeStableId('en', `${fileId}|${canonicalKey}|${label}|${paragraphRefs.join(',')}`),
      graphId,
      fileId,
      fileName,
      canonicalKey,
      mentionText: label,
      entityType: nodeType,
      paragraphRefs: JSON.stringify(paragraphRefs),
      chunkId,
      properties: JSON.stringify(properties),
      confidence: Number(properties.confidence || 0.85),
      createdAt: now
    })

    pushMentionRef(mentionsByParagraph, paragraphRefs, 'entity', label)
    fileNodes.push({
      id: makeStableId('fn', `${fileId}|${label}`),
      graphId,
      fileId,
      fileName,
      nodeLabel: label,
      nodeType,
      nodeProperties: JSON.stringify(properties),
      createdAt: now
    })
  }

  for (const edge of extractedEdges || []) {
    const sourceLabel = String(edge?.source || '').trim()
    const targetLabel = String(edge?.target || '').trim()
    if (!sourceLabel || !targetLabel) continue

    const sourceType = normalizeNodeType(nodeTypeMap.get(sourceLabel) || '')
    const targetType = normalizeNodeType(nodeTypeMap.get(targetLabel) || '')
    const sourceKey = nodeKeyByLabel.get(sourceLabel)
      || `${sourceType === EVENT_NODE_TYPE ? 'event' : 'entity'}:${normalizeLabel(sourceLabel)}`
    const targetKey = nodeKeyByLabel.get(targetLabel)
      || `${targetType === EVENT_NODE_TYPE ? 'event' : 'entity'}:${normalizeLabel(targetLabel)}`
    const paragraphRefs = uniqueIntegers([
      ...(paragraphRefsByNode.get(sourceLabel) || []),
      ...(paragraphRefsByNode.get(targetLabel) || [])
    ])
    const chunkId = findSegmentIdForParagraphRefs(segments, paragraphRefs)
    const label = normalizeRelationLabel(edge.label)
    const properties = isObject(edge.properties) ? edge.properties : {}

    relationMentions.push({
      id: makeStableId('rm', `${fileId}|${sourceKey}|${targetKey}|${label}|${paragraphRefs.join(',')}`),
      graphId,
      fileId,
      fileName,
      sourceKind: sourceType === EVENT_NODE_TYPE ? 'event' : 'entity',
      sourceKey,
      targetKind: targetType === EVENT_NODE_TYPE ? 'event' : 'entity',
      targetKey,
      label,
      paragraphRefs: JSON.stringify(paragraphRefs),
      chunkId,
      properties: JSON.stringify(properties),
      confidence: Number(properties.confidence || 0.8),
      createdAt: now
    })

    const fileEdgeId = makeStableId('fe', `${fileId}|${sourceLabel}|${targetLabel}|${label}`)
    if (!fileEdgeIds.has(fileEdgeId)) {
      fileEdges.push({
        id: fileEdgeId,
        graphId,
        fileId,
        fileName,
        sourceLabel,
        targetLabel,
        label,
        edgeProperties: JSON.stringify(properties),
        createdAt: now
      })
      fileEdgeIds.add(fileEdgeId)
    }
  }

  const paragraphRows = buildParagraphRows(
    graphId,
    fileId,
    fileName,
    paragraphs,
    mentionsByParagraph,
    now
  )
  const segmentRows = buildSegmentRows(
    graphId,
    fileId,
    fileName,
    segments,
    mentionsByParagraph,
    now
  )

  return {
    paragraphs,
    paragraphRows,
    segmentRows,
    entityMentions,
    eventMentions,
    relationMentions,
    fileNodes,
    fileEdges,
    counts: {
      paragraphCount: paragraphRows.length,
      segmentCount: segmentRows.length,
      entityMentionCount: entityMentions.length,
      eventMentionCount: eventMentions.length,
      relationMentionCount: relationMentions.length
    }
  }
}

function aggregateEntityCanonicalRows(graphId, entityRows = [], now = Date.now()) {
  const { clusters, keyAliasMap } = clusterEntityRows(entityRows)
  const mergedEntries = new Map()

  for (const cluster of clusters) {
    const entry = {
      key: cluster.finalKey,
      labels: cluster.rows.map(row => row.mentionText),
      entityTypes: cluster.rows.map(row => row.entityType),
      aliases: new Set(cluster.rows.map(row => row.mentionText)),
      properties: {},
      fileIds: new Set(),
      fileNames: new Set(),
      paragraphRefs: new Set(),
      createdAt: Math.min(...cluster.rows.map(row => Number(row.createdAt || now)))
    }

    for (const row of cluster.rows) {
      entry.properties = mergeProperties(entry.properties, parseJson(row.properties, {}))
      entry.fileIds.add(row.fileId)
      if (row.fileName) entry.fileNames.add(row.fileName)
      entry.aliases.add(row.mentionText)
      for (const paragraphIndex of parseJson(row.paragraphRefs, [])) {
        entry.paragraphRefs.add(Number(paragraphIndex))
      }
    }

    if (!mergedEntries.has(entry.key)) {
      mergedEntries.set(entry.key, entry)
      continue
    }

    const existing = mergedEntries.get(entry.key)
    existing.labels.push(...entry.labels)
    existing.entityTypes.push(...entry.entityTypes)
    entry.aliases.forEach(alias => existing.aliases.add(alias))
    existing.properties = mergeProperties(existing.properties, entry.properties)
    entry.fileIds.forEach(fileId => existing.fileIds.add(fileId))
    entry.fileNames.forEach(fileName => existing.fileNames.add(fileName))
    entry.paragraphRefs.forEach(paragraphIndex => existing.paragraphRefs.add(paragraphIndex))
    existing.createdAt = Math.min(existing.createdAt, entry.createdAt)
  }

  const canonicalEntities = [...mergedEntries.values()].map(entry => {
    const label = pickMostFrequent(entry.labels)
    const entityType = pickMostFrequent(entry.entityTypes) || 'default'
    const supportCount = entry.fileIds.size
    const properties = {
      ...entry.properties,
      aliases: [...entry.aliases],
      supportCount,
      paragraphRefs: [...entry.paragraphRefs].sort((a, b) => a - b)
    }

    return {
      id: makeStableId('ce', entry.key),
      graphId,
      canonicalKey: entry.key,
      label,
      entityType,
      aliases: JSON.stringify([...entry.aliases]),
      properties: JSON.stringify(properties),
      supportCount,
      createdAt: entry.createdAt,
      updatedAt: now,
      nodeId: makeStableId('n', entry.key),
      sourceFile: [...entry.fileNames][0] || ''
    }
  })

  return { canonicalEntities, keyAliasMap }
}

function aggregateEventCanonicalRows(graphId, eventRows = [], entityKeyAliasMap = new Map(), now = Date.now()) {
  const { clusters, keyAliasMap } = clusterEventRows(eventRows, entityKeyAliasMap)

  const canonicalEvents = clusters.map(cluster => {
    const entry = {
      key: cluster.finalKey,
      labels: cluster.rows.map(row => row.label),
      eventTypes: cluster.rows.map(row => row.eventType),
      triggers: cluster.rows.map(row => row.trigger),
      predicateTexts: cluster.rows.map(row => row.predicateText),
      summaries: cluster.rows.map(row => row.summary),
      subjectKeys: new Set(),
      objectKeys: new Set(),
      timeTexts: [],
      locationTexts: [],
      aliases: new Set(cluster.rows.map(row => row.label)),
      properties: {},
      fileIds: new Set(),
      fileNames: new Set(),
      paragraphRefs: new Set(),
      createdAt: Math.min(...cluster.rows.map(row => Number(row.createdAt || now)))
    }

    for (const row of cluster.rows) {
      entry.properties = mergeProperties(entry.properties, parseJson(row.properties, {}))
      entry.fileIds.add(row.fileId)
      if (row.fileName) entry.fileNames.add(row.fileName)
      entry.aliases.add(row.label)
      for (const subjectKey of parseJson(row.subjectKeys, [])) entry.subjectKeys.add(entityKeyAliasMap.get(subjectKey) || subjectKey)
      for (const objectKey of parseJson(row.objectKeys, [])) entry.objectKeys.add(entityKeyAliasMap.get(objectKey) || objectKey)
      for (const paragraphIndex of parseJson(row.paragraphRefs, [])) {
        entry.paragraphRefs.add(Number(paragraphIndex))
      }
      if (row.timeText) entry.timeTexts.push(row.timeText)
      if (row.locationText) entry.locationTexts.push(row.locationText)
    }

    const label = pickMostFrequent(entry.labels)
    const eventType = pickMostFrequent(entry.eventTypes) || '一般事件'
    const trigger = pickMostFrequent(entry.triggers) || label
    const predicateText = pickMostFrequent(entry.predicateTexts) || trigger
    const summary = pickLongestText(entry.summaries) || label
    const timeText = pickMostFrequent(entry.timeTexts)
    const locationText = pickMostFrequent(entry.locationTexts)
    const supportCount = entry.fileIds.size
    const subjectKeys = [...entry.subjectKeys]
    const objectKeys = [...entry.objectKeys]
    const properties = {
      ...entry.properties,
      aliases: [...entry.aliases],
      mergedCanonicalKeys: [...cluster.sourceKeys],
      supportCount,
      eventType,
      trigger,
      predicateText,
      summary,
      timeText,
      locationText,
      subjectKeys,
      objectKeys,
      paragraphRefs: [...entry.paragraphRefs].sort((a, b) => a - b)
    }

    return {
      id: makeStableId('cv', entry.key),
      graphId,
      canonicalKey: entry.key,
      label,
      eventType,
      trigger,
      summary,
      subjectKeys: JSON.stringify(subjectKeys),
      predicateText,
      objectKeys: JSON.stringify(objectKeys),
      timeText,
      locationText,
      aliases: JSON.stringify([...entry.aliases]),
      properties: JSON.stringify(properties),
      supportCount,
      createdAt: entry.createdAt,
      updatedAt: now,
      nodeId: makeStableId('n', entry.key),
      sourceFile: [...entry.fileNames][0] || ''
    }
  })

  return { canonicalEvents, keyAliasMap }
}

function aggregateEventCanonicalRowsSafe(graphId, eventRows = [], entityKeyAliasMap = new Map(), now = Date.now()) {
  const { clusters, keyAliasMap } = clusterEventRows(eventRows, entityKeyAliasMap)
  const mergedEntries = new Map()

  for (const cluster of clusters) {
    const entry = {
      key: cluster.finalKey,
      labels: cluster.rows.map(row => row.label),
      eventTypes: cluster.rows.map(row => row.eventType),
      triggers: cluster.rows.map(row => row.trigger),
      predicateTexts: cluster.rows.map(row => row.predicateText),
      summaries: cluster.rows.map(row => row.summary),
      subjectKeys: new Set(),
      objectKeys: new Set(),
      timeTexts: [],
      locationTexts: [],
      aliases: new Set(cluster.rows.map(row => row.label)),
      properties: {},
      fileIds: new Set(),
      fileNames: new Set(),
      paragraphRefs: new Set(),
      createdAt: Math.min(...cluster.rows.map(row => Number(row.createdAt || now)))
    }

    for (const row of cluster.rows) {
      entry.properties = mergeProperties(entry.properties, parseJson(row.properties, {}))
      entry.fileIds.add(row.fileId)
      if (row.fileName) entry.fileNames.add(row.fileName)
      entry.aliases.add(row.label)
      for (const subjectKey of parseJson(row.subjectKeys, [])) entry.subjectKeys.add(entityKeyAliasMap.get(subjectKey) || subjectKey)
      for (const objectKey of parseJson(row.objectKeys, [])) entry.objectKeys.add(entityKeyAliasMap.get(objectKey) || objectKey)
      for (const paragraphIndex of parseJson(row.paragraphRefs, [])) {
        entry.paragraphRefs.add(Number(paragraphIndex))
      }
      if (row.timeText) entry.timeTexts.push(row.timeText)
      if (row.locationText) entry.locationTexts.push(row.locationText)
    }

    if (!mergedEntries.has(entry.key)) {
      mergedEntries.set(entry.key, entry)
      continue
    }

    const existing = mergedEntries.get(entry.key)
    existing.labels.push(...entry.labels)
    existing.eventTypes.push(...entry.eventTypes)
    existing.triggers.push(...entry.triggers)
    existing.predicateTexts.push(...entry.predicateTexts)
    existing.summaries.push(...entry.summaries)
    entry.subjectKeys.forEach(subjectKey => existing.subjectKeys.add(subjectKey))
    entry.objectKeys.forEach(objectKey => existing.objectKeys.add(objectKey))
    existing.timeTexts.push(...entry.timeTexts)
    existing.locationTexts.push(...entry.locationTexts)
    entry.aliases.forEach(alias => existing.aliases.add(alias))
    existing.properties = mergeProperties(existing.properties, entry.properties)
    entry.fileIds.forEach(fileId => existing.fileIds.add(fileId))
    entry.fileNames.forEach(fileName => existing.fileNames.add(fileName))
    entry.paragraphRefs.forEach(paragraphIndex => existing.paragraphRefs.add(paragraphIndex))
    existing.createdAt = Math.min(existing.createdAt, entry.createdAt)
  }

  const canonicalEvents = [...mergedEntries.values()].map(entry => {
    const label = pickMostFrequent(entry.labels)
    const eventType = pickMostFrequent(entry.eventTypes) || '一般事件'
    const trigger = pickMostFrequent(entry.triggers) || label
    const predicateText = pickMostFrequent(entry.predicateTexts) || trigger
    const summary = pickLongestText(entry.summaries) || label
    const timeText = pickMostFrequent(entry.timeTexts)
    const locationText = pickMostFrequent(entry.locationTexts)
    const supportCount = entry.fileIds.size
    const subjectKeys = [...entry.subjectKeys]
    const objectKeys = [...entry.objectKeys]
    const properties = {
      ...entry.properties,
      aliases: [...entry.aliases],
      supportCount,
      eventType,
      trigger,
      predicateText,
      summary,
      timeText,
      locationText,
      subjectKeys,
      objectKeys,
      paragraphRefs: [...entry.paragraphRefs].sort((a, b) => a - b)
    }

    return {
      id: makeStableId('cv', entry.key),
      graphId,
      canonicalKey: entry.key,
      label,
      eventType,
      trigger,
      summary,
      subjectKeys: JSON.stringify(subjectKeys),
      predicateText,
      objectKeys: JSON.stringify(objectKeys),
      timeText,
      locationText,
      aliases: JSON.stringify([...entry.aliases]),
      properties: JSON.stringify(properties),
      supportCount,
      createdAt: entry.createdAt,
      updatedAt: now,
      nodeId: makeStableId('n', entry.key),
      sourceFile: [...entry.fileNames][0] || ''
    }
  })

  return { canonicalEvents, keyAliasMap }
}

function aggregateEdgeRows(graphId, relationRows = [], nodeIdByKey = new Map(), keyAliasMap = new Map(), now = Date.now()) {
  const edgeMap = new Map()

  for (const row of relationRows) {
    const sourceKey = keyAliasMap.get(String(row.sourceKey || '').trim()) || String(row.sourceKey || '').trim()
    const targetKey = keyAliasMap.get(String(row.targetKey || '').trim()) || String(row.targetKey || '').trim()
    const label = normalizeRelationLabel(row.label)
    if (!sourceKey || !targetKey) continue
    if (!nodeIdByKey.has(sourceKey) || !nodeIdByKey.has(targetKey)) continue

    const aggregateKey = `${sourceKey}|${targetKey}|${label}`
    if (!edgeMap.has(aggregateKey)) {
      edgeMap.set(aggregateKey, {
        key: aggregateKey,
        graphId,
        sourceKey,
        targetKey,
        label,
        source: nodeIdByKey.get(sourceKey),
        target: nodeIdByKey.get(targetKey),
        fileIds: new Set(),
        fileNames: new Set(),
        paragraphRefs: new Set(),
        properties: {},
        createdAt: Number(row.createdAt || now),
        weight: 0
      })
    }

    const entry = edgeMap.get(aggregateKey)
    entry.weight += 1
    entry.fileIds.add(row.fileId)
    if (row.fileName) entry.fileNames.add(row.fileName)
    entry.properties = mergeProperties(entry.properties, parseJson(row.properties, {}))
    for (const paragraphIndex of parseJson(row.paragraphRefs, [])) {
      entry.paragraphRefs.add(Number(paragraphIndex))
    }
    entry.createdAt = Math.min(entry.createdAt, Number(row.createdAt || now))
  }

  return [...edgeMap.values()].map(entry => {
    const supportCount = entry.fileIds.size
    return {
      id: makeStableId('e', entry.key),
      graphId,
      source: entry.source,
      target: entry.target,
      label: entry.label,
      weight: entry.weight,
      properties: JSON.stringify({
        ...entry.properties,
        supportCount,
        paragraphRefs: [...entry.paragraphRefs].sort((a, b) => a - b)
      }),
      sourceFile: [...entry.fileNames][0] || '',
      createdAt: entry.createdAt
    }
  })
}

export function rebuildCanonicalGraph(graphId, allRows, run) {
  const now = Date.now()
  const entityRows = allRows(
    `
    SELECT *
    FROM entity_mentions
    WHERE graphId = ?
    ORDER BY createdAt ASC
    `,
    [graphId]
  )
  const eventRows = allRows(
    `
    SELECT *
    FROM event_mentions
    WHERE graphId = ?
    ORDER BY createdAt ASC
    `,
    [graphId]
  )
  const relationRows = allRows(
    `
    SELECT *
    FROM relation_mentions
    WHERE graphId = ?
    ORDER BY createdAt ASC
    `,
    [graphId]
  )

  const { canonicalEntities, keyAliasMap: entityKeyAliasMap } = aggregateEntityCanonicalRows(graphId, entityRows, now)
  const { canonicalEvents, keyAliasMap: eventKeyAliasMap } = aggregateEventCanonicalRowsSafe(graphId, eventRows, entityKeyAliasMap, now)
  const keyAliasMap = new Map([...entityKeyAliasMap.entries(), ...eventKeyAliasMap.entries()])
  const nodeIdByKey = new Map()

  run('DELETE FROM canonical_entities WHERE graphId = ?', [graphId])
  run('DELETE FROM canonical_events WHERE graphId = ?', [graphId])
  run('DELETE FROM nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM edges WHERE graphId = ?', [graphId])

  for (const entity of canonicalEntities) {
    nodeIdByKey.set(entity.canonicalKey, entity.nodeId)
    run(
      `
      INSERT INTO canonical_entities (id, graphId, canonicalKey, label, entityType, aliases, properties, supportCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entity.id,
        graphId,
        entity.canonicalKey,
        entity.label,
        entity.entityType,
        entity.aliases,
        entity.properties,
        entity.supportCount,
        entity.createdAt,
        entity.updatedAt
      ]
    )
    run(
      `
      INSERT INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entity.nodeId,
        graphId,
        entity.label,
        entity.entityType,
        entity.properties,
        entity.sourceFile,
        entity.createdAt
      ]
    )
  }

  for (const event of canonicalEvents) {
    nodeIdByKey.set(event.canonicalKey, event.nodeId)
    run(
      `
      INSERT INTO canonical_events (id, graphId, canonicalKey, label, eventType, trigger, summary, subjectKeys, predicateText, objectKeys, timeText, locationText, aliases, properties, supportCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        event.id,
        graphId,
        event.canonicalKey,
        event.label,
        event.eventType,
        event.trigger,
        event.summary,
        event.subjectKeys,
        event.predicateText,
        event.objectKeys,
        event.timeText,
        event.locationText,
        event.aliases,
        event.properties,
        event.supportCount,
        event.createdAt,
        event.updatedAt
      ]
    )
    run(
      `
      INSERT INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        event.nodeId,
        graphId,
        event.label,
        EVENT_NODE_TYPE,
        event.properties,
        event.sourceFile,
        event.createdAt
      ]
    )
  }

  const edges = aggregateEdgeRows(graphId, relationRows, nodeIdByKey, keyAliasMap, now)
  for (const edge of edges) {
    run(
      `
      INSERT INTO edges (id, graphId, source, target, label, weight, properties, sourceFile, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        edge.id,
        graphId,
        edge.source,
        edge.target,
        edge.label,
        edge.weight,
        edge.properties,
        edge.sourceFile,
        edge.createdAt
      ]
    )
  }

  run(
    'UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
    [canonicalEntities.length + canonicalEvents.length, edges.length, now, graphId]
  )

  return {
    nodeCount: canonicalEntities.length + canonicalEvents.length,
    edgeCount: edges.length
  }
}
