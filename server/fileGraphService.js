import { createHash } from 'crypto'
import { getDB, saveToDiskSync } from './db.js'
import { syncWorkspaceGraph } from './graphdb.js'
import { buildKnowledgeRecords, rebuildCanonicalGraph, splitIntoParagraphs } from './knowledgePipeline.js'
import { buildQueryPlan } from '../shared/queryPlanner.js'

function allRows(sql, params = []) {
  const db = getDB()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function getRow(sql, params = []) {
  return allRows(sql, params)[0] || null
}

function run(sql, params = []) {
  const db = getDB()
  db.run(sql, params)
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function computeContentHash(content = '') {
  return createHash('sha256').update(String(content || ''), 'utf8').digest('hex')
}

function getWorkspaceGraphSummary(graphId) {
  const graph = getRow('SELECT nodeCount, edgeCount FROM graphs WHERE id = ?', [graphId]) || {}
  return {
    nodeCount: Number(graph.nodeCount || 0),
    edgeCount: Number(graph.edgeCount || 0)
  }
}

export function findDuplicateWorkspaceFile(graphId, content = '', excludeFileId = '') {
  const contentHash = computeContentHash(content)
  const duplicate = getRow(
    `
    SELECT id, fileName, importedAt, contentHash
    FROM files
    WHERE graphId = ? AND contentHash = ? AND id != ?
    ORDER BY importedAt DESC
    LIMIT 1
    `,
    [graphId, contentHash, String(excludeFileId || '')]
  )

  return duplicate
    ? {
        fileId: duplicate.id,
        fileName: duplicate.fileName,
        importedAt: Number(duplicate.importedAt || 0),
        contentHash
      }
    : null
}

export async function rebuildGraphDb(graphId) {
  const workspace = getRow('SELECT * FROM graphs WHERE id = ?', [graphId])
  if (!workspace) return

  const nodes = allRows('SELECT * FROM nodes WHERE graphId = ?', [graphId]).map(node => ({
    ...node,
    properties: parseJson(node.properties, {})
  }))
  const edges = allRows('SELECT * FROM edges WHERE graphId = ?', [graphId]).map(edge => ({
    ...edge,
    properties: parseJson(edge.properties, {})
  }))

  await syncWorkspaceGraph(workspace, nodes, edges)
}

export function clearFileArtifacts(graphId, fileId, fileName = '') {
  run('DELETE FROM file_chunks WHERE fileId = ?', [fileId])
  run('DELETE FROM file_nodes WHERE graphId = ? AND fileId = ?', [graphId, fileId])
  run('DELETE FROM file_edges WHERE graphId = ? AND fileId = ?', [graphId, fileId])
  run('DELETE FROM entity_mentions WHERE graphId = ? AND fileId = ?', [graphId, fileId])
  run('DELETE FROM event_mentions WHERE graphId = ? AND fileId = ?', [graphId, fileId])
  run('DELETE FROM relation_mentions WHERE graphId = ? AND fileId = ?', [graphId, fileId])

  if (fileName) {
    run('DELETE FROM import_history WHERE graphId = ? AND fileName = ?', [graphId, fileName])
  }
}

function insertChunkRows(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT INTO file_chunks (
        id, graphId, fileId, fileName, paragraphIndex, content,
        linkedNodes, linkedEvents, importedAt, chunkKind, segmentIndex, parentChunkId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.paragraphIndex,
        row.content,
        row.linkedNodes,
        row.linkedEvents,
        row.importedAt,
        row.chunkKind,
        row.segmentIndex,
        row.parentChunkId
      ]
    )
  }
}

function insertFileNodes(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT INTO file_nodes (id, graphId, fileId, fileName, nodeLabel, nodeType, nodeProperties, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.nodeLabel,
        row.nodeType,
        row.nodeProperties,
        row.createdAt
      ]
    )
  }
}

function insertFileEdges(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT OR REPLACE INTO file_edges (id, graphId, fileId, fileName, sourceLabel, targetLabel, label, edgeProperties, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.sourceLabel,
        row.targetLabel,
        row.label,
        row.edgeProperties,
        row.createdAt
      ]
    )
  }
}

function insertEntityMentions(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT INTO entity_mentions (
        id, graphId, fileId, fileName, canonicalKey, mentionText, entityType,
        paragraphRefs, chunkId, properties, confidence, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.canonicalKey,
        row.mentionText,
        row.entityType,
        row.paragraphRefs,
        row.chunkId,
        row.properties,
        row.confidence,
        row.createdAt
      ]
    )
  }
}

function insertEventMentions(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT INTO event_mentions (
        id, graphId, fileId, fileName, canonicalKey, label, eventType, trigger, summary,
        subjectKeys, predicateText, objectKeys, timeText, locationText, paragraphRefs,
        chunkId, properties, confidence, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.canonicalKey,
        row.label,
        row.eventType,
        row.trigger,
        row.summary,
        row.subjectKeys,
        row.predicateText,
        row.objectKeys,
        row.timeText,
        row.locationText,
        row.paragraphRefs,
        row.chunkId,
        row.properties,
        row.confidence,
        row.createdAt
      ]
    )
  }
}

function insertRelationMentions(rows = []) {
  for (const row of rows) {
    run(
      `
      INSERT INTO relation_mentions (
        id, graphId, fileId, fileName, sourceKind, sourceKey, targetKind, targetKey,
        label, paragraphRefs, chunkId, properties, confidence, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.graphId,
        row.fileId,
        row.fileName,
        row.sourceKind,
        row.sourceKey,
        row.targetKind,
        row.targetKey,
        row.label,
        row.paragraphRefs,
        row.chunkId,
        row.properties,
        row.confidence,
        row.createdAt
      ]
    )
  }
}

export async function persistImportedFile({
  graphId,
  id,
  fileName,
  content,
  fileType,
  fileSize,
  importStatus = 'completed',
  importMessage = '',
  nodes = [],
  edges = []
}) {
  const workspace = getRow('SELECT * FROM graphs WHERE id = ?', [graphId])
  if (!workspace) {
    throw new Error('Workspace not found')
  }

  if (!id || !fileName || !content) {
    throw new Error('id, fileName and content are required')
  }

  const now = Date.now()
  const contentHash = computeContentHash(content)
  const previous = getRow('SELECT id, fileName FROM files WHERE id = ? AND graphId = ?', [id, graphId])
  if (previous) {
    clearFileArtifacts(graphId, id, previous.fileName)
    run('DELETE FROM files WHERE id = ? AND graphId = ?', [id, graphId])
  }

  const duplicate = getRow(
    `
    SELECT id, fileName, importedAt
    FROM files
    WHERE graphId = ? AND contentHash = ? AND id != ?
    ORDER BY importedAt DESC
    LIMIT 1
    `,
    [graphId, contentHash, id]
  )
  if (duplicate) {
    return {
      id,
      skipped: true,
      duplicateOf: {
        fileId: duplicate.id,
        fileName: duplicate.fileName,
        importedAt: Number(duplicate.importedAt || 0),
        contentHash
      },
      graph: getWorkspaceGraphSummary(graphId),
      counts: {
        entityMentionCount: 0,
        eventMentionCount: 0,
        relationMentionCount: 0
      }
    }
  }

  let records = null
  try {
    run(
      `
      INSERT INTO files (id, graphId, fileName, content, fileType, fileSize, importedAt, contentHash, importStatus, importMessage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        graphId,
        fileName,
        content,
        fileType || 'txt',
        Number(fileSize || content.length),
        now,
        contentHash,
        String(importStatus || 'completed'),
        String(importMessage || '')
      ]
    )

    records = buildKnowledgeRecords(graphId, id, fileName, content, nodes, edges, now)
    insertChunkRows([...records.paragraphRows, ...records.segmentRows])
    insertFileNodes(records.fileNodes)
    insertFileEdges(records.fileEdges)
    insertEntityMentions(records.entityMentions)
    insertEventMentions(records.eventMentions)
    insertRelationMentions(records.relationMentions)

    rebuildCanonicalGraph(graphId, allRows, run)
    const graph = syncWorkspaceCounts(graphId)
    run(
      `
      INSERT OR REPLACE INTO import_history (id, graphId, fileName, timestamp, nodesAdded, edgesAdded)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        graphId,
        fileName,
        now,
        records.counts.entityMentionCount + records.counts.eventMentionCount,
        records.counts.relationMentionCount
      ]
    )

    saveToDiskSync()
    await rebuildGraphDb(graphId)

    return {
      id,
      graph,
      counts: records.counts
    }
  } catch (error) {
    clearFileArtifacts(graphId, id, fileName)
    run('DELETE FROM files WHERE id = ? AND graphId = ?', [id, graphId])
    run('DELETE FROM import_history WHERE id = ? AND graphId = ?', [id, graphId])
    rebuildCanonicalGraph(graphId, allRows, run)
    syncWorkspaceCounts(graphId)
    saveToDiskSync()
    throw error
  }
}

export async function deleteImportedFile(graphId, fileId) {
  const file = getRow(
    'SELECT id, graphId, fileName FROM files WHERE id = ? AND graphId = ?',
    [fileId, graphId]
  )
  if (!file) {
    throw new Error('File not found')
  }

  clearFileArtifacts(graphId, fileId, file.fileName)
  run('DELETE FROM files WHERE id = ? AND graphId = ?', [fileId, graphId])
  run('DELETE FROM import_history WHERE id = ? AND graphId = ?', [fileId, graphId])

  rebuildCanonicalGraph(graphId, allRows, run)
  const graph = syncWorkspaceCounts(graphId)
  saveToDiskSync()
  await rebuildGraphDb(graphId)
  return graph
}

export function listWorkspaceFiles(graphId) {
  return allRows(
    `
    SELECT id, graphId, fileName, fileType, fileSize, importedAt, importStatus, importMessage
    FROM files
    WHERE graphId = ?
    ORDER BY importedAt DESC
    `,
    [graphId]
  )
}

export function getFileDetail(fileId) {
  const file = getRow('SELECT * FROM files WHERE id = ?', [fileId])
  if (!file) return null

  let chunks = allRows(
    `
    SELECT id, paragraphIndex, content, linkedNodes, linkedEvents
    FROM file_chunks
    WHERE fileId = ? AND chunkKind = 'paragraph'
    ORDER BY paragraphIndex ASC
    `,
    [fileId]
  ).map(chunk => ({
    ...chunk,
    linkedNodes: parseJson(chunk.linkedNodes, []),
    linkedEvents: parseJson(chunk.linkedEvents, [])
  }))

  if (chunks.length === 0) {
    chunks = splitIntoParagraphs(file.content || '').map((content, index) => ({
      id: `${fileId}_fallback_${index + 1}`,
      paragraphIndex: index + 1,
      content,
      linkedNodes: [],
      linkedEvents: []
    }))
  }

  return { ...file, chunks }
}

export function syncWorkspaceCounts(graphId) {
  const counts = getRow(
    `
    SELECT
      (SELECT COUNT(*) FROM nodes WHERE graphId = ?) AS nodeCount,
      (SELECT COUNT(*) FROM edges WHERE graphId = ?) AS edgeCount
    `,
    [graphId, graphId]
  ) || {}

  const nodeCount = Number(counts.nodeCount || 0)
  const edgeCount = Number(counts.edgeCount || 0)
  run(
    'UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
    [nodeCount, edgeCount, Date.now(), graphId]
  )

  return { nodeCount, edgeCount }
}

function collectLinkedLabels(paragraph, nodes = []) {
  const linkedNodes = []
  const linkedEvents = []
  for (const node of nodes) {
    const label = String(node.label || '').trim()
    if (!label || !paragraph.includes(label)) continue
    if (/事件|event/i.test(String(node.type || ''))) linkedEvents.push(label)
    else linkedNodes.push(label)
  }
  return {
    linkedNodes: [...new Set(linkedNodes)],
    linkedEvents: [...new Set(linkedEvents)]
  }
}

const NOISE_SEARCH_KEYWORDS = new Set([
  '最近', '发生', '什么', '如何', '为何', '为什么', '情况', '相关',
  '近伊', '朗发', '生了', '了什', '么', '问题', '消息'
])

function normalizeSearchKeyword(keyword = '') {
  return String(keyword || '').trim().toLowerCase()
}

function isMeaningfulSearchKeyword(keyword = '') {
  const normalized = normalizeSearchKeyword(keyword)
  if (!normalized || normalized.length < 2) return false
  if (NOISE_SEARCH_KEYWORDS.has(normalized)) return false
  if (/^[^a-zA-Z\u4e00-\u9fff]+$/i.test(normalized)) return false
  return true
}

function normalizeSearchPayload(input = {}) {
  if (Array.isArray(input)) {
    return {
      query: '',
      keywords: input,
      queryPlan: buildQueryPlan(input.join(' ')),
      graphCandidates: [],
      maxResults: 12
    }
  }

  const keywords = Array.isArray(input?.keywords) ? input.keywords : []
  const query = String(input?.query || '').trim()
  return {
    query,
    keywords,
    queryPlan: input?.queryPlan || buildQueryPlan(query || keywords.join(' ')),
    graphCandidates: Array.isArray(input?.graphCandidates) ? input.graphCandidates : [],
    maxResults: Math.max(1, Number(input?.maxResults || 12))
  }
}

function buildLinkedTypeMap(graphId) {
  const rows = allRows('SELECT label, type FROM nodes WHERE graphId = ?', [graphId])
  const map = new Map()
  for (const row of rows) {
    map.set(String(row.label || '').trim(), String(row.type || '').trim())
  }
  return map
}

function includesAny(text = '', candidates = []) {
  return candidates.some(item => {
    const normalized = normalizeSearchKeyword(item)
    return normalized && text.includes(normalized)
  })
}

function hasNearbyTerms(text = '', leftTerms = [], rightTerms = [], windowSize = 24) {
  const source = String(text || '')
  for (const left of leftTerms) {
    const leftValue = String(left || '').trim()
    if (!leftValue) continue
    const leftIndex = source.indexOf(leftValue)
    if (leftIndex === -1) continue

    for (const right of rightTerms) {
      const rightValue = String(right || '').trim()
      if (!rightValue) continue
      const rightIndex = source.indexOf(rightValue)
      if (rightIndex === -1) continue
      if (Math.abs(leftIndex - rightIndex) <= windowSize) return true
    }
  }
  return false
}

function scoreParagraph(paragraph, linkedNodes = [], linkedEvents = [], options = {}) {
  const contentLower = String(paragraph || '').toLowerCase()
  let score = 0
  const matchedKeywords = []
  const meaningfulKeywords = (options.keywords || []).filter(isMeaningfulSearchKeyword)
  const targetTerms = (options.queryPlan?.targetTerms || []).filter(isMeaningfulSearchKeyword)
  const graphCandidates = (options.graphCandidates || []).filter(Boolean)
  const linkedTypeMap = options.linkedTypeMap || new Map()
  const queryType = String(options.queryPlan?.queryType || '')

  for (const keyword of meaningfulKeywords) {
    const normalized = normalizeSearchKeyword(keyword)
    if (!normalized) continue
    if (contentLower.includes(normalized)) {
      score += 2
      matchedKeywords.push(keyword)
    }
  }

  for (const keyword of meaningfulKeywords) {
    if (linkedNodes.includes(keyword) || linkedEvents.includes(keyword)) {
      score += 3
    }
  }

  for (const term of targetTerms) {
    const normalized = normalizeSearchKeyword(term)
    if (!normalized) continue
    if (contentLower.includes(normalized)) {
      score += 4
    }
    if (linkedNodes.some(label => normalizeSearchKeyword(label).includes(normalized))) {
      score += 5
    }
    if (linkedEvents.some(label => normalizeSearchKeyword(label).includes(normalized))) {
      score += 6
    }
  }

  for (const label of graphCandidates) {
    if (linkedNodes.includes(label)) score += 7
    if (linkedEvents.includes(label)) score += 8
  }

  if (queryType === 'fact.person') {
    const roleTerms = ['领导人', '领袖', '最高领袖', '总统', '总理', '继任', '接班']
    const countryTerms = targetTerms.filter(term => !roleTerms.includes(term))
    const personLabels = linkedNodes.filter(label => linkedTypeMap.get(label) === '人物')
    const hasPersonNode = personLabels.length > 0
    const hasRoleCue = includesAny(contentLower, roleTerms)

    if (hasPersonNode) score += 8
    else score -= 4

    if (hasRoleCue) score += 5
    if (hasPersonNode && hasRoleCue) score += 5
    if (countryTerms.length > 0 && hasNearbyTerms(paragraph, countryTerms, roleTerms, 28)) score += 7
    if (includesAny(contentLower, ['成为', '接替', '继位', '接任', '出任', '担任', '发表首次声明'])) score += 6
    if (/地方领导人|市长/.test(paragraph)) score -= 6
  }

  if (queryType === 'fact.time') {
    if (/\d{4}年|\d{1,2}月|\d{1,2}日|周[一二三四五六日天]/.test(paragraph)) score += 6
  }

  if (queryType === 'fact.location') {
    const hasLocationNode = [...linkedNodes, ...linkedEvents].some(label => {
      const type = linkedTypeMap.get(label)
      return type === '地点' || type === '设施'
    })
    if (hasLocationNode) score += 5
  }

  if (queryType === 'reason.cause') {
    if (includesAny(contentLower, ['导致', '因为', '由于', '使得', '推高', '引发', '造成'])) score += 5
    if (linkedEvents.length > 0) score += 3
  }

  if (queryType === 'impact.effect') {
    if (includesAny(contentLower, ['影响', '冲击', '后果', '波及', '外溢', '传导'])) score += 5
    if (linkedEvents.length > 0) score += 2
  }

  if (queryType === 'overview.recent') {
    if (linkedEvents.length > 0) score += 4
    if (Number(options.paragraphIndex || 0) <= 6) score += 2
    if (/\d{4}年|\d{1,2}月|\d{1,2}日/.test(paragraph)) score += 2
  }

  if (/发布时间[:：]|链接[:：]|摘要[:：]/.test(paragraph)) score -= 1
  if (String(paragraph || '').length > 1000) score -= 1

  return {
    score,
    matchedKeywords: [...new Set(matchedKeywords)],
    meaningfulKeywordCount: Math.max(meaningfulKeywords.length, targetTerms.length)
  }
}

export function searchWorkspaceFiles(graphId, input = {}) {
  const payload = normalizeSearchPayload(input)
  let chunks = allRows(
    `
    SELECT id, fileId, fileName, paragraphIndex, content, linkedNodes, linkedEvents
    FROM file_chunks
    WHERE graphId = ? AND chunkKind = 'paragraph'
    ORDER BY fileName ASC, paragraphIndex ASC
    `,
    [graphId]
  )

  if (chunks.length === 0) {
    const graphNodes = allRows('SELECT label, type FROM nodes WHERE graphId = ?', [graphId])
    const files = allRows('SELECT id, fileName, content FROM files WHERE graphId = ?', [graphId])
    chunks = files.flatMap(file =>
      splitIntoParagraphs(file.content).map((paragraph, index) => {
        const linked = collectLinkedLabels(paragraph, graphNodes)
        return {
          id: `${file.id}_paragraph_${index + 1}`,
          fileId: file.id,
          fileName: file.fileName,
          paragraphIndex: index + 1,
          content: paragraph,
          linkedNodes: JSON.stringify(linked.linkedNodes),
          linkedEvents: JSON.stringify(linked.linkedEvents)
        }
      })
    )
  }

  const linkedTypeMap = buildLinkedTypeMap(graphId)
  const dedupedResults = new Map()
  for (const chunk of chunks) {
    const linkedNodes = parseJson(chunk.linkedNodes, [])
    const linkedEvents = parseJson(chunk.linkedEvents, [])
    const { score, matchedKeywords, meaningfulKeywordCount } = scoreParagraph(
      chunk.content,
      linkedNodes,
      linkedEvents,
      {
        keywords: payload.keywords,
        queryPlan: payload.queryPlan,
        graphCandidates: payload.graphCandidates,
        linkedTypeMap,
        paragraphIndex: chunk.paragraphIndex
      }
    )

    if (score <= 0) continue
    if (meaningfulKeywordCount === 0) continue

    const hasGraphLinks = linkedNodes.length > 0 || linkedEvents.length > 0
    if (!hasGraphLinks && score < 4) continue

    const result = {
      chunkId: chunk.id,
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      paragraphIndex: chunk.paragraphIndex,
      score,
      text: chunk.content,
      matchedKeywords,
      linkedNodes,
      linkedEvents
    }

    const dedupeKey = [
      String(chunk.fileName || '').trim(),
      Number(chunk.paragraphIndex || 0),
      String(chunk.content || '').trim()
    ].join('::')

    if (!dedupedResults.has(dedupeKey)) {
      dedupedResults.set(dedupeKey, result)
      continue
    }

    const existing = dedupedResults.get(dedupeKey)
    existing.score = Math.max(existing.score, result.score)
    existing.matchedKeywords = [...new Set([...(existing.matchedKeywords || []), ...matchedKeywords])]
    existing.linkedNodes = [...new Set([...(existing.linkedNodes || []), ...linkedNodes])]
    existing.linkedEvents = [...new Set([...(existing.linkedEvents || []), ...linkedEvents])]
  }

  const results = [...dedupedResults.values()]
  results.sort((a, b) => b.score - a.score || a.paragraphIndex - b.paragraphIndex)
  if (results.length === 0) return []

  const topScore = results[0].score
  const minAcceptedScore = Math.max(6, topScore - 4)
  return results
    .filter(item => item.score >= minAcceptedScore)
    .slice(0, payload.maxResults)
}
