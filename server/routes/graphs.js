import { Router } from 'express'
import { getDB, saveToDisk, saveToDiskSync } from '../db.js'
import { deleteWorkspaceGraph, queryWorkspaceSubgraph, syncWorkspaceGraph } from '../graphdb.js'
import { syncWorkspaceCounts } from '../fileGraphService.js'
import { makeStableId, rebuildCanonicalGraph } from '../knowledgePipeline.js'
import { buildExtractionPrompt, buildIntentProfile, generateExtractionPrompt } from '../workspaceIntent.js'

const router = Router()

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

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

function stripCanonicalPrefix(value = '') {
  return String(value || '').replace(/^(entity|event):/i, '').trim()
}

function tokenizeSearchText(value = '') {
  return String(value || '')
    .split(/[、,，；;：:\s/]+/)
    .map(item => String(item || '').trim())
    .filter(item => item.length >= 2)
}

function parseEventPhrase(value = '') {
  const text = String(value || '').trim()
  if (!text) return []

  const predicates = [
    '持续打击', '联合打击', '发动打击', '直接打击', '空袭', '袭击', '施压', '封锁',
    '威胁封锁', '拦截', '发射', '报复', '回应', '谈判', '停火', '声明', '会谈',
    '伤亡', '遇袭', '受损', '死亡'
  ].sort((a, b) => b.length - a.length)

  for (const predicate of predicates) {
    const index = text.indexOf(predicate)
    if (index <= 0) continue
    const subject = text.slice(0, index).trim()
    const object = text.slice(index + predicate.length).trim()
    return [subject, predicate, object].filter(item => item.length >= 2)
  }

  if (text.endsWith('死亡') && text.length > 2) {
    return [text.slice(0, -2).trim(), '死亡'].filter(item => item.length >= 2)
  }

  return tokenizeSearchText(text)
}

function buildSearchTexts(values = []) {
  const output = new Set()
  for (const value of values || []) {
    const text = String(value || '').trim()
    if (!text) continue
    if (text.length >= 2) output.add(text)
    for (const token of tokenizeSearchText(text)) output.add(token)
    for (const token of parseEventPhrase(text)) output.add(token)
  }
  return [...output]
}

async function rebuildGraphDb(graphId) {
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

function clearWorkspaceGraphData(graphId) {
  run('DELETE FROM nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM edges WHERE graphId = ?', [graphId])
  run('DELETE FROM import_history WHERE graphId = ?', [graphId])
  run('DELETE FROM entity_mentions WHERE graphId = ?', [graphId])
  run('DELETE FROM event_mentions WHERE graphId = ?', [graphId])
  run('DELETE FROM relation_mentions WHERE graphId = ?', [graphId])
  run('DELETE FROM canonical_entities WHERE graphId = ?', [graphId])
  run('DELETE FROM canonical_events WHERE graphId = ?', [graphId])
  run('UPDATE graphs SET nodeCount = 0, edgeCount = 0, updatedAt = ? WHERE id = ?', [Date.now(), graphId])
}

function reconcileWorkspaceSourceState(graphId) {
  const fileCount = Number(getRow('SELECT COUNT(*) AS count FROM files WHERE graphId = ?', [graphId])?.count || 0)
  if (fileCount > 0) return false

  const nodeCount = Number(getRow('SELECT COUNT(*) AS count FROM nodes WHERE graphId = ?', [graphId])?.count || 0)
  const edgeCount = Number(getRow('SELECT COUNT(*) AS count FROM edges WHERE graphId = ?', [graphId])?.count || 0)
  if (nodeCount === 0 && edgeCount === 0) return false

  clearWorkspaceGraphData(graphId)
  return true
}

function reconcileWorkspaceCounts(graphId) {
  const actual = syncWorkspaceCounts(graphId)
  const meta = getRow('SELECT nodeCount, edgeCount FROM graphs WHERE id = ?', [graphId]) || {}
  return (
    Number(meta.nodeCount || 0) !== Number(actual.nodeCount || 0) ||
    Number(meta.edgeCount || 0) !== Number(actual.edgeCount || 0)
  )
}

async function repairWorkspaceKnowledgeState(graphId) {
  const snapshot = getRow(
    `
    SELECT
      (SELECT COUNT(*) FROM files WHERE graphId = ?) AS fileCount,
      (SELECT COUNT(*) FROM entity_mentions WHERE graphId = ?) AS entityMentionCount,
      (SELECT COUNT(*) FROM event_mentions WHERE graphId = ?) AS eventMentionCount,
      (SELECT COUNT(*) FROM relation_mentions WHERE graphId = ?) AS relationMentionCount,
      (SELECT COUNT(*) FROM canonical_entities WHERE graphId = ?) AS canonicalEntityCount,
      (SELECT COUNT(*) FROM canonical_events WHERE graphId = ?) AS canonicalEventCount,
      (SELECT COUNT(*) FROM nodes WHERE graphId = ?) AS nodeCount,
      (SELECT COUNT(*) FROM edges WHERE graphId = ?) AS edgeCount
    `,
    [graphId, graphId, graphId, graphId, graphId, graphId, graphId, graphId]
  ) || {}

  const fileCount = Number(snapshot.fileCount || 0)
  if (fileCount === 0) return false

  const mentionCount =
    Number(snapshot.entityMentionCount || 0) +
    Number(snapshot.eventMentionCount || 0) +
    Number(snapshot.relationMentionCount || 0)
  if (mentionCount === 0) return false

  const canonicalCount =
    Number(snapshot.canonicalEntityCount || 0) +
    Number(snapshot.canonicalEventCount || 0)
  const nodeCount = Number(snapshot.nodeCount || 0)
  const edgeCount = Number(snapshot.edgeCount || 0)

  const needsRepair =
    canonicalCount === 0 ||
    (nodeCount === 0 && edgeCount === 0) ||
    (canonicalCount > 0 && nodeCount === 0)

  if (!needsRepair) return false

  rebuildCanonicalGraph(graphId, allRows, run)
  syncWorkspaceCounts(graphId)
  saveToDiskSync()
  await rebuildGraphDb(graphId)
  return true
}

function deleteWorkspaceFileArtifacts(graphId) {
  run('DELETE FROM file_chunks WHERE graphId = ?', [graphId])
  run('DELETE FROM files WHERE graphId = ?', [graphId])
  run('DELETE FROM file_nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM file_edges WHERE graphId = ?', [graphId])
}

function ensureWorkspaceExtractionPrompt(graph) {
  if (!graph) return graph
  const storedIntentProfile = parseJson(graph.intentProfile, {})
  const intentProfile = buildIntentProfile(graph.intentQuery || '', graph.intentSummary || '')
  const extractionPrompt = String(graph.extractionPrompt || '').trim()
    || buildExtractionPrompt(graph.intentQuery || '', graph.intentSummary || '', intentProfile)

  const shouldSyncProfile = JSON.stringify(storedIntentProfile) !== JSON.stringify(intentProfile)
  if (shouldSyncProfile || !String(graph.extractionPrompt || '').trim()) {
    run(
      'UPDATE graphs SET intentProfile = ?, extractionPrompt = ?, updatedAt = ? WHERE id = ?',
      [JSON.stringify(intentProfile), extractionPrompt, Date.now(), graph.id]
    )
    graph.extractionPrompt = extractionPrompt
  }

  return {
    ...graph,
    intentProfile,
    extractionPrompt
  }
}

function getCanonicalNodeExplain(graphId, nodeId) {
  const entityRows = allRows('SELECT * FROM canonical_entities WHERE graphId = ?', [graphId]).map(row => ({
    ...row,
    aliases: parseJson(row.aliases, []),
    properties: parseJson(row.properties, {})
  }))
  const eventRows = allRows('SELECT * FROM canonical_events WHERE graphId = ?', [graphId]).map(row => ({
    ...row,
    aliases: parseJson(row.aliases, []),
    properties: parseJson(row.properties, {}),
    subjectKeys: parseJson(row.subjectKeys, []),
    objectKeys: parseJson(row.objectKeys, [])
  }))

  const entity = entityRows.find(row => makeStableId('n', `${graphId}|${row.canonicalKey}`) === nodeId)
  if (entity) return { kind: 'entity', canonical: entity }

  const event = eventRows.find(row => makeStableId('n', `${graphId}|${row.canonicalKey}`) === nodeId)
  if (event) return { kind: 'event', canonical: event }

  return null
}

function buildEvidenceSummary(kind, graphId, canonical, mergedKeys = []) {
  if (kind === 'entity') {
    const rows = allRows(
      `
      SELECT fileId, fileName, canonicalKey, mentionText, paragraphRefs, confidence, createdAt
      FROM entity_mentions
      WHERE graphId = ?
      `,
      [graphId]
    ).filter(row => mergedKeys.includes(row.canonicalKey))

    return rows.map(row => ({
      fileId: row.fileId,
      fileName: row.fileName,
      sourceCanonicalKey: row.canonicalKey,
      mentionText: row.mentionText,
      paragraphRefs: parseJsonArray(row.paragraphRefs),
      confidence: Number(row.confidence || 0),
      createdAt: Number(row.createdAt || 0)
    }))
  }

  const rows = allRows(
    `
    SELECT fileId, fileName, canonicalKey, label, summary, subjectKeys, predicateText, objectKeys, paragraphRefs, confidence, createdAt
    FROM event_mentions
    WHERE graphId = ?
    `,
    [graphId]
  ).filter(row => mergedKeys.includes(row.canonicalKey))

  return rows.map(row => ({
      fileId: row.fileId,
      fileName: row.fileName,
      sourceCanonicalKey: row.canonicalKey,
      mentionText: row.label,
      summary: row.summary,
      subjectKeys: parseJsonArray(row.subjectKeys),
      predicateText: row.predicateText || '',
      objectKeys: parseJsonArray(row.objectKeys),
      paragraphRefs: parseJsonArray(row.paragraphRefs),
      confidence: Number(row.confidence || 0),
      createdAt: Number(row.createdAt || 0)
    }))
}

function loadParagraphDetails(graphId, fileId, paragraphRefs = [], matchTexts = []) {
  const indexes = [...new Set(paragraphRefs.map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0))]
  const normalizedMatches = buildSearchTexts(matchTexts)

  const rows = (() => {
    if (indexes.length > 0) {
      const placeholders = indexes.map(() => '?').join(', ')
      return allRows(
        `
        SELECT paragraphIndex, content
        FROM file_chunks
        WHERE graphId = ? AND fileId = ? AND chunkKind = 'paragraph' AND paragraphIndex IN (${placeholders})
        ORDER BY paragraphIndex ASC
        `,
        [graphId, fileId, ...indexes]
      )
    }

    return allRows(
      `
      SELECT paragraphIndex, content
      FROM file_chunks
      WHERE graphId = ? AND fileId = ? AND chunkKind = 'paragraph'
      ORDER BY paragraphIndex ASC
      `,
      [graphId, fileId]
    )
    .slice(0, 48)
  })().map(row => ({
    paragraphIndex: Number(row.paragraphIndex || 0),
    content: row.content || ''
  }))

  if (rows.length === 0) return []
  if (normalizedMatches.length === 0) return indexes.length > 0 ? rows : rows.slice(0, 2)

  const scoredRows = rows
    .map(row => ({
      ...row,
      score: normalizedMatches.reduce((count, text) => count + (row.content.includes(text) ? 1 : 0), 0)
    }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score || left.paragraphIndex - right.paragraphIndex)

  if (scoredRows.length > 0) {
    return scoredRows.slice(0, indexes.length > 0 ? rows.length : 3).map(({ score, ...row }) => row)
  }

  return indexes.length > 0 ? rows : []
}

function buildMergeReason(kind, canonical, evidence) {
  if (kind === 'entity') {
    if (evidence.mentionText === canonical.label) {
      return '该 mention 被选为当前 canonical 标签'
    }
    if ((canonical.aliases || []).includes(evidence.mentionText)) {
      return '该 mention 作为别名并入同一实体'
    }
    return '该 mention 与当前实体在别名归一化后被合并'
  }

  if (evidence.mentionText === canonical.label) {
    return '该 mention 被选为当前 canonical 事件标题'
  }

  const reasons = []
  if (canonical.trigger && evidence.summary?.includes(canonical.trigger)) reasons.push(`触发词命中「${canonical.trigger}」`)
  if (canonical.subjectKeys?.length) reasons.push('主体角色与当前事件对齐')
  if (canonical.objectKeys?.length) reasons.push('客体角色与当前事件对齐')
  return reasons.join('，') || '该 mention 与当前事件在触发词和角色上被合并'
}

function enrichEvidenceSummary(kind, graphId, canonical, evidence = []) {
  const roleTexts = [
    ...(canonical?.subjectKeys || []).map(stripCanonicalPrefix),
    ...(canonical?.objectKeys || []).map(stripCanonicalPrefix)
  ]

  return evidence
    .map(item => {
      const itemRoleTexts = [
        ...(item.subjectKeys || []).map(stripCanonicalPrefix),
        ...(item.objectKeys || []).map(stripCanonicalPrefix)
      ]
      const matchTexts = [
        canonical?.label,
        item.mentionText,
        item.summary,
        canonical?.trigger,
        item.predicateText,
        canonical?.predicateText,
        ...roleTexts,
        ...itemRoleTexts,
        ...(canonical?.aliases || [])
      ]

      return {
        ...item,
        mergeReason: buildMergeReason(kind, canonical, item),
        paragraphs: loadParagraphDetails(graphId, item.fileId, item.paragraphRefs, matchTexts)
      }
    })
    .map(item => {
      if (item.paragraphs.length > 0) return item
      return {
        ...item,
        paragraphs: loadParagraphDetails(graphId, item.fileId, item.paragraphRefs, [
          canonical?.label,
          item.mentionText,
          item.summary
        ])
      }
    })
    .filter(item => item.paragraphs.length > 0 || item.paragraphRefs?.length > 0)
}

function buildMergeSummary(kind, canonical, evidence = []) {
  const groups = new Map()

  for (const item of evidence) {
    const key = item.sourceCanonicalKey || canonical.canonicalKey
    if (!groups.has(key)) {
      groups.set(key, {
        sourceCanonicalKey: key,
        mentions: new Set(),
        fileNames: new Set(),
        paragraphRefs: new Set()
      })
    }

    const group = groups.get(key)
    group.mentions.add(item.mentionText)
    if (item.fileName) group.fileNames.add(item.fileName)
    for (const ref of item.paragraphRefs || []) group.paragraphRefs.add(Number(ref))
  }

  return [...groups.values()].map(group => ({
    sourceCanonicalKey: group.sourceCanonicalKey,
    mentions: [...group.mentions],
    fileNames: [...group.fileNames],
    paragraphRefs: [...group.paragraphRefs].filter(Boolean).sort((a, b) => a - b),
    reason: kind === 'entity'
      ? '这些 mention 在别名归一化后被并入同一实体'
      : '这些 mention 在事件类型、触发词和角色上被并入同一事件'
  }))
}

function buildRelatedEdgeSummary(graphId, nodeId) {
  const nodeMap = new Map(allRows('SELECT id, label, type FROM nodes WHERE graphId = ?', [graphId]).map(row => [row.id, row]))
  return allRows(
    `
    SELECT id, source, target, label, properties
    FROM edges
    WHERE graphId = ? AND (source = ? OR target = ?)
    ORDER BY createdAt ASC
    `,
    [graphId, nodeId, nodeId]
  ).map(edge => {
    const otherId = edge.source === nodeId ? edge.target : edge.source
    const otherNode = nodeMap.get(otherId) || null
    const properties = parseJson(edge.properties, {})
    return {
      id: edge.id,
      label: edge.label,
      direction: edge.source === nodeId ? 'out' : 'in',
      otherNodeId: otherId,
      otherLabel: otherNode?.label || '',
      otherType: otherNode?.type || '',
      supportCount: Number(properties.supportCount || 0),
      paragraphRefs: parseJsonArray(properties.paragraphRefs)
    }
  })
}

router.get('/', async (req, res) => {
  try {
    const graphIds = allRows('SELECT id FROM graphs').map(row => row.id)
    let reconciled = false
    for (const graphId of graphIds) {
      reconciled = reconcileWorkspaceSourceState(graphId) || reconciled
      reconciled = (await repairWorkspaceKnowledgeState(graphId)) || reconciled
      reconcileWorkspaceCounts(graphId)
    }
    if (reconciled) saveToDisk()

    const graphs = allRows(
      `
      SELECT
        g.*,
        (SELECT COUNT(*) FROM files f WHERE f.graphId = g.id) AS fileCount,
        (SELECT COUNT(*) FROM sessions s WHERE s.graphId = g.id) AS sessionCount
      FROM graphs g
      ORDER BY g.updatedAt DESC
      `
    ).map(graph => ensureWorkspaceExtractionPrompt(graph))

    saveToDisk()
    res.json(graphs)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const now = Date.now()
    const {
      id,
      name = '未命名工作区',
      intentQuery = '',
      intentSummary = '',
      extractionPrompt = ''
    } = req.body || {}

    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!String(intentQuery || '').trim()) {
      return res.status(400).json({ error: 'intentQuery is required' })
    }

    const intentProfile = buildIntentProfile(intentQuery, intentSummary)
    const promptResult = String(extractionPrompt || '').trim()
      ? { extractionPrompt: String(extractionPrompt || '').trim(), intentProfile }
      : await generateExtractionPrompt(intentQuery, intentSummary, {
        name,
        intentProfile
      })
    const nextExtractionPrompt = promptResult.extractionPrompt
    run(
      `
      INSERT INTO graphs (id, name, intentQuery, intentSummary, intentProfile, extractionPrompt, nodeCount, edgeCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `,
      [
        id,
        String(name).trim(),
        String(intentQuery).trim(),
        String(intentSummary).trim(),
        JSON.stringify(intentProfile),
        nextExtractionPrompt,
        now,
        now
      ]
    )

    saveToDiskSync()
    res.json({ success: true, id, intentProfile, extractionPrompt: nextExtractionPrompt })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/prompt-preview', async (req, res) => {
  try {
    const {
      name = '',
      intentQuery = '',
      intentSummary = ''
    } = req.body || {}

    if (!String(intentQuery || '').trim()) {
      return res.status(400).json({ error: 'intentQuery is required' })
    }

    const promptResult = await generateExtractionPrompt(intentQuery, intentSummary, {
      name,
      intentProfile: buildIntentProfile(intentQuery, intentSummary)
    })

    res.json({
      intentProfile: promptResult.intentProfile,
      extractionPrompt: promptResult.extractionPrompt,
      generator: promptResult.generator,
      usedFallback: promptResult.usedFallback
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    let graph = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id])
    if (!graph) return res.status(404).json({ error: 'Workspace not found' })
    graph = ensureWorkspaceExtractionPrompt(graph)

    if (reconcileWorkspaceSourceState(req.params.id)) {
      saveToDisk()
      graph = ensureWorkspaceExtractionPrompt(getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id]))
    }
    if (await repairWorkspaceKnowledgeState(req.params.id)) {
      graph = ensureWorkspaceExtractionPrompt(getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id]))
    }
    reconcileWorkspaceCounts(req.params.id)
    graph = ensureWorkspaceExtractionPrompt(getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id]))

    saveToDisk()

    const nodes = allRows('SELECT * FROM nodes WHERE graphId = ?', [req.params.id]).map(node => ({
      ...node,
      properties: parseJson(node.properties, {})
    }))
    const edges = allRows('SELECT * FROM edges WHERE graphId = ?', [req.params.id]).map(edge => ({
      ...edge,
      properties: parseJson(edge.properties, {})
    }))
    const importHistory = allRows(
      'SELECT * FROM import_history WHERE graphId = ? ORDER BY timestamp DESC',
      [req.params.id]
    )

    res.json({
      ...graph,
      nodes,
      edges,
      importHistory
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id/nodes/:nodeId/explain', (req, res) => {
  try {
    const workspace = getRow('SELECT id FROM graphs WHERE id = ?', [req.params.id])
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

    const node = getRow('SELECT * FROM nodes WHERE graphId = ? AND id = ?', [req.params.id, req.params.nodeId])
    if (!node) return res.status(404).json({ error: 'Node not found' })

    const match = getCanonicalNodeExplain(req.params.id, req.params.nodeId)
    if (!match) {
      return res.json({
        node: {
          ...node,
          properties: parseJson(node.properties, {})
        },
        canonical: null,
        evidence: [],
        relatedEdges: buildRelatedEdgeSummary(req.params.id, req.params.nodeId)
      })
    }

    const canonical = match.canonical
    const mergedKeys = canonical.properties?.mergedCanonicalKeys || [canonical.canonicalKey]
    const evidence = enrichEvidenceSummary(
      match.kind,
      req.params.id,
      canonical,
      buildEvidenceSummary(match.kind, req.params.id, canonical, mergedKeys)
    )
    const mergeSummary = buildMergeSummary(match.kind, canonical, evidence)

    res.json({
      node: {
        ...node,
        properties: parseJson(node.properties, {})
      },
      canonical: {
        kind: match.kind,
        canonicalKey: canonical.canonicalKey,
        label: canonical.label,
        aliases: canonical.aliases || [],
        supportCount: Number(canonical.supportCount || 0),
        mergedCanonicalKeys: mergedKeys,
        subjectKeys: canonical.subjectKeys || [],
        objectKeys: canonical.objectKeys || [],
        timeText: canonical.timeText || '',
        locationText: canonical.locationText || '',
        summary: canonical.summary || '',
        properties: canonical.properties || {}
      },
      mergeSummary,
      evidence,
      relatedEdges: buildRelatedEdgeSummary(req.params.id, req.params.nodeId)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/:id/context', async (req, res) => {
  try {
    const workspace = getRow('SELECT id FROM graphs WHERE id = ?', [req.params.id])
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

    const {
      labels = [],
      maxDepth = 2,
      maxNodes = 80,
      maxSeeds = 12,
      pathLimit = 200
    } = req.body || {}

    const result = await queryWorkspaceSubgraph(req.params.id, labels, {
      maxDepth,
      maxNodes,
      maxSeeds,
      pathLimit
    })
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id
    const {
      name,
      intentQuery = '',
      intentSummary = '',
      extractionPrompt = '',
      nodes = [],
      edges = [],
      importHistory = []
    } = req.body || {}

    const now = Date.now()
    const existing = getRow('SELECT * FROM graphs WHERE id = ?', [id])
    const nextName = name || existing?.name || '未命名工作区'
    const nextIntentQuery = intentQuery || existing?.intentQuery || ''
    const nextIntentSummary = intentSummary || existing?.intentSummary || ''
    const nextIntentProfile = buildIntentProfile(nextIntentQuery, nextIntentSummary)
    const nextExtractionPrompt = String(extractionPrompt || '').trim()
      || existing?.extractionPrompt
      || (await generateExtractionPrompt(nextIntentQuery, nextIntentSummary, {
        name: nextName,
        intentProfile: nextIntentProfile
      })).extractionPrompt

    if (existing) {
      run('DELETE FROM nodes WHERE graphId = ?', [id])
      run('DELETE FROM edges WHERE graphId = ?', [id])
      run('DELETE FROM import_history WHERE graphId = ?', [id])
      run(
        `
        UPDATE graphs
        SET name = ?, intentQuery = ?, intentSummary = ?, intentProfile = ?, extractionPrompt = ?, nodeCount = ?, edgeCount = ?, updatedAt = ?
        WHERE id = ?
        `,
        [
          nextName,
          nextIntentQuery,
          nextIntentSummary,
          JSON.stringify(nextIntentProfile),
          nextExtractionPrompt,
          nodes.length,
          edges.length,
          now,
          id
        ]
      )
    } else {
      run(
        `
        INSERT INTO graphs (id, name, intentQuery, intentSummary, intentProfile, extractionPrompt, nodeCount, edgeCount, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          nextName,
          nextIntentQuery,
          nextIntentSummary,
          JSON.stringify(nextIntentProfile),
          nextExtractionPrompt,
          nodes.length,
          edges.length,
          now,
          now
        ]
      )
    }

    for (const node of nodes) {
      run(
        `
        INSERT INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          node.id,
          id,
          node.label,
          node.type || 'default',
          JSON.stringify(node.properties || {}),
          node.sourceFile || '',
          node.createdAt || now
        ]
      )
    }

    for (const edge of edges) {
      run(
        `
        INSERT INTO edges (id, graphId, source, target, label, weight, properties, sourceFile, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          edge.id,
          id,
          edge.source,
          edge.target,
          edge.label || '',
          edge.weight || 1,
          JSON.stringify(edge.properties || {}),
          edge.sourceFile || '',
          edge.createdAt || now
        ]
      )
    }

    for (const record of importHistory) {
      run(
        `
        INSERT INTO import_history (id, graphId, fileName, timestamp, nodesAdded, edgesAdded)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          record.id,
          id,
          record.fileName,
          record.timestamp || now,
          record.nodesAdded || 0,
          record.edgesAdded || 0
        ]
      )
    }

    saveToDiskSync()
    await rebuildGraphDb(id)
    res.json({ success: true, intentProfile: nextIntentProfile, extractionPrompt: nextExtractionPrompt })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const existing = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Workspace not found' })

    const {
      name = existing.name,
      intentQuery = existing.intentQuery || '',
      intentSummary = existing.intentSummary || '',
      extractionPrompt = existing.extractionPrompt || ''
    } = req.body || {}

    const intentProfile = buildIntentProfile(intentQuery, intentSummary)
    const nextExtractionPrompt = String(extractionPrompt || '').trim()
      || (await generateExtractionPrompt(intentQuery, intentSummary, {
        name,
        intentProfile
      })).extractionPrompt
    run(
      'UPDATE graphs SET name = ?, intentQuery = ?, intentSummary = ?, intentProfile = ?, extractionPrompt = ?, updatedAt = ? WHERE id = ?',
      [name, intentQuery, intentSummary, JSON.stringify(intentProfile), nextExtractionPrompt, Date.now(), req.params.id]
    )

    saveToDiskSync()
    await rebuildGraphDb(req.params.id)
    res.json({ success: true, intentProfile, extractionPrompt: nextExtractionPrompt })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    clearWorkspaceGraphData(id)
    deleteWorkspaceFileArtifacts(id)
    run('DELETE FROM messages WHERE graphId = ?', [id])
    run('DELETE FROM sessions WHERE graphId = ?', [id])
    run('DELETE FROM graphs WHERE id = ?', [id])
    saveToDiskSync()
    await deleteWorkspaceGraph(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:id/imports/:importId', async (req, res) => {
  try {
    const { id, importId } = req.params
    const record = getRow('SELECT * FROM import_history WHERE id = ? AND graphId = ?', [importId, id])
    if (!record) return res.status(404).json({ error: 'Import not found' })

    const file = getRow('SELECT id, fileName FROM files WHERE graphId = ? AND id = ?', [id, importId])
      || getRow('SELECT id, fileName FROM files WHERE graphId = ? AND fileName = ?', [id, record.fileName])

    if (file) {
      run('DELETE FROM file_chunks WHERE fileId = ?', [file.id])
      run('DELETE FROM file_nodes WHERE fileId = ?', [file.id])
      run('DELETE FROM file_edges WHERE fileId = ?', [file.id])
      run('DELETE FROM entity_mentions WHERE fileId = ?', [file.id])
      run('DELETE FROM event_mentions WHERE fileId = ?', [file.id])
      run('DELETE FROM relation_mentions WHERE fileId = ?', [file.id])
      run('DELETE FROM files WHERE id = ?', [file.id])
    }

    run('DELETE FROM import_history WHERE id = ? AND graphId = ?', [importId, id])
    rebuildCanonicalGraph(id, allRows, run)

    saveToDiskSync()
    await rebuildGraphDb(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
