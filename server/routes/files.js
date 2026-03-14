import { Router } from 'express'
import { getDB, saveToDisk } from '../db.js'
import { syncWorkspaceGraph } from '../graphdb.js'
import { createHash } from 'crypto'

const router = Router()

function allRows(sql, params = []) {
  const db = getDB()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function getRow(sql, params = []) {
  const rows = allRows(sql, params)
  return rows.length > 0 ? rows[0] : null
}

function run(sql, params = []) {
  const db = getDB()
  db.run(sql, params)
}

function normalizeLabel(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function makeStableId(prefix, value) {
  const digest = createHash('md5').update(String(value)).digest('hex').slice(0, 16)
  return `${prefix}_${digest}`
}

function aggregateGraphFromFileRecords(graphId) {
  const fileNodes = allRows(
    `
    SELECT fileId, fileName, nodeLabel, nodeType, nodeProperties, createdAt
    FROM file_nodes
    WHERE graphId = ?
    ORDER BY createdAt ASC
    `,
    [graphId]
  )
  const fileEdges = allRows(
    `
    SELECT fileId, fileName, sourceLabel, targetLabel, label, edgeProperties, createdAt
    FROM file_edges
    WHERE graphId = ?
    ORDER BY createdAt ASC
    `,
    [graphId]
  )

  const nodeMap = new Map()
  for (const node of fileNodes) {
    const normalized = normalizeLabel(node.nodeLabel)
    if (!normalized) continue

    const properties = parseJson(node.nodeProperties, {})
    if (!nodeMap.has(normalized)) {
      nodeMap.set(normalized, {
        id: makeStableId('n', normalized),
        label: node.nodeLabel,
        type: node.nodeType || 'default',
        properties,
        sourceFile: node.fileName || '',
        createdAt: node.createdAt || Date.now()
      })
      continue
    }

    const existing = nodeMap.get(normalized)
    existing.properties = { ...existing.properties, ...properties }
    if ((!existing.type || existing.type === 'default') && node.nodeType) {
      existing.type = node.nodeType
    }
  }

  const edgeMap = new Map()
  for (const edge of fileEdges) {
    const sourceKey = normalizeLabel(edge.sourceLabel)
    const targetKey = normalizeLabel(edge.targetLabel)
    if (!sourceKey || !targetKey) continue

    if (!nodeMap.has(sourceKey)) {
      nodeMap.set(sourceKey, {
        id: makeStableId('n', sourceKey),
        label: edge.sourceLabel,
        type: 'default',
        properties: {},
        sourceFile: edge.fileName || '',
        createdAt: edge.createdAt || Date.now()
      })
    }
    if (!nodeMap.has(targetKey)) {
      nodeMap.set(targetKey, {
        id: makeStableId('n', targetKey),
        label: edge.targetLabel,
        type: 'default',
        properties: {},
        sourceFile: edge.fileName || '',
        createdAt: edge.createdAt || Date.now()
      })
    }

    const sourceId = nodeMap.get(sourceKey).id
    const targetId = nodeMap.get(targetKey).id
    const relationLabel = String(edge.label || '').trim()
    const aggregateKey = `${sourceKey}|${targetKey}|${relationLabel}`

    if (!edgeMap.has(aggregateKey)) {
      edgeMap.set(aggregateKey, {
        id: makeStableId('e', aggregateKey),
        source: sourceId,
        target: targetId,
        label: relationLabel,
        weight: 1,
        properties: parseJson(edge.edgeProperties, {}),
        sourceFile: edge.fileName || '',
        createdAt: edge.createdAt || Date.now()
      })
      continue
    }

    const existing = edgeMap.get(aggregateKey)
    existing.weight += 1
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values())
  }
}

function hasCompleteFileGraphRecords(graphId, excludedFileId = null) {
  const files = allRows(
    'SELECT id FROM files WHERE graphId = ?' + (excludedFileId ? ' AND id != ?' : ''),
    excludedFileId ? [graphId, excludedFileId] : [graphId]
  )
  if (files.length === 0) return true

  const nodeBackedIds = new Set(
    allRows('SELECT DISTINCT fileId FROM file_nodes WHERE graphId = ?', [graphId]).map(row => row.fileId)
  )

  return files.every(file => nodeBackedIds.has(file.id))
}

function persistAggregatedGraph(graphId, graphData) {
  run('DELETE FROM nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM edges WHERE graphId = ?', [graphId])

  for (const node of graphData.nodes) {
    run(
      `
      INSERT OR REPLACE INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        node.id,
        graphId,
        node.label,
        node.type || 'default',
        JSON.stringify(node.properties || {}),
        node.sourceFile || '',
        node.createdAt || Date.now()
      ]
    )
  }

  for (const edge of graphData.edges) {
    run(
      `
      INSERT OR REPLACE INTO edges (id, graphId, source, target, label, weight, properties, sourceFile, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        edge.id,
        graphId,
        edge.source,
        edge.target,
        edge.label || '',
        edge.weight || 1,
        JSON.stringify(edge.properties || {}),
        edge.sourceFile || '',
        edge.createdAt || Date.now()
      ]
    )
  }

  run(
    'UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
    [graphData.nodes.length, graphData.edges.length, Date.now(), graphId]
  )
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

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function splitIntoParagraphs(content = '') {
  return content
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
}

function collectLinkedLabels(paragraph, nodes = []) {
  const linkedNodes = []
  const linkedEvents = []
  for (const node of nodes) {
    const label = String(node.label || '').trim()
    if (!label || !paragraph.includes(label)) continue
    if (['事件', 'event', 'Event'].includes(node.type)) linkedEvents.push(label)
    else linkedNodes.push(label)
  }
  return {
    linkedNodes: [...new Set(linkedNodes)],
    linkedEvents: [...new Set(linkedEvents)]
  }
}

function scoreParagraph(paragraph, keywords = [], linkedNodes = [], linkedEvents = []) {
  const contentLower = paragraph.toLowerCase()
  let score = 0
  const matchedKeywords = []

  for (const keyword of keywords) {
    const kw = String(keyword || '').trim().toLowerCase()
    if (!kw) continue
    if (contentLower.includes(kw)) {
      score += 2
      matchedKeywords.push(keyword)
    }
  }

  for (const keyword of keywords) {
    if (linkedNodes.includes(keyword) || linkedEvents.includes(keyword)) {
      score += 3
    }
  }

  return {
    score,
    matchedKeywords: [...new Set(matchedKeywords)]
  }
}

router.get('/:graphId', (req, res) => {
  try {
    const files = allRows(
      `
      SELECT id, graphId, fileName, fileType, fileSize, importedAt
      FROM files
      WHERE graphId = ?
      ORDER BY importedAt DESC
      `,
      [req.params.graphId]
    )
    res.json(files)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/detail/:fileId', (req, res) => {
  try {
    const file = getRow('SELECT * FROM files WHERE id = ?', [req.params.fileId])
    if (!file) return res.status(404).json({ error: 'File not found' })

    const chunks = allRows(
      `
      SELECT id, paragraphIndex, content, linkedNodes, linkedEvents
      FROM file_chunks
      WHERE fileId = ?
      ORDER BY paragraphIndex ASC
      `,
      [req.params.fileId]
    ).map(chunk => ({
      ...chunk,
      linkedNodes: parseJson(chunk.linkedNodes, []),
      linkedEvents: parseJson(chunk.linkedEvents, [])
    }))

    res.json({ ...file, chunks })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:graphId', (req, res) => {
  try {
    const {
      id,
      fileName,
      content,
      fileType,
      fileSize,
      nodes = [],
      edges = []
    } = req.body || {}

    if (!id || !fileName || !content) {
      return res.status(400).json({ error: 'id, fileName and content are required' })
    }

    const now = Date.now()
    run(
      `
      INSERT INTO files (id, graphId, fileName, content, fileType, fileSize, importedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [id, req.params.graphId, fileName, content, fileType, fileSize || content.length, now]
    )

    const paragraphs = splitIntoParagraphs(content)
    paragraphs.forEach((paragraph, index) => {
      const linked = collectLinkedLabels(paragraph, nodes)
      run(
        `
        INSERT INTO file_chunks (id, graphId, fileId, fileName, paragraphIndex, content, linkedNodes, linkedEvents, importedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          `${id}_${index + 1}`,
          req.params.graphId,
          id,
          fileName,
          index + 1,
          paragraph,
          JSON.stringify(linked.linkedNodes),
          JSON.stringify(linked.linkedEvents),
          now
        ]
      )
    })

    run('DELETE FROM file_nodes WHERE graphId = ? AND fileId = ?', [req.params.graphId, id])
    run('DELETE FROM file_edges WHERE graphId = ? AND fileId = ?', [req.params.graphId, id])

    nodes.forEach((node, index) => {
      run(
        `
        INSERT INTO file_nodes (id, graphId, fileId, fileName, nodeLabel, nodeType, nodeProperties, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          `${id}_node_${index + 1}`,
          req.params.graphId,
          id,
          fileName,
          node.label || '',
          node.type || 'default',
          JSON.stringify(node.properties || {}),
          now
        ]
      )
    })

    edges.forEach((edge, index) => {
      run(
        `
        INSERT INTO file_edges (id, graphId, fileId, fileName, sourceLabel, targetLabel, label, edgeProperties, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          `${id}_edge_${index + 1}`,
          req.params.graphId,
          id,
          fileName,
          edge.source || '',
          edge.target || '',
          edge.label || '',
          JSON.stringify(edge.properties || {}),
          now
        ]
      )
    })

    saveToDisk()
    res.json({ success: true, id, paragraphCount: paragraphs.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:graphId/detail/:fileId', async (req, res) => {
  try {
    const { graphId, fileId } = req.params
    const file = getRow(
      'SELECT id, graphId, fileName FROM files WHERE id = ? AND graphId = ?',
      [fileId, graphId]
    )

    if (!file) return res.status(404).json({ error: 'File not found' })

    run('DELETE FROM file_chunks WHERE fileId = ?', [fileId])
    run('DELETE FROM files WHERE id = ? AND graphId = ?', [fileId, graphId])
    run('DELETE FROM file_nodes WHERE graphId = ? AND fileId = ?', [graphId, fileId])
    run('DELETE FROM file_edges WHERE graphId = ? AND fileId = ?', [graphId, fileId])
    run('DELETE FROM import_history WHERE graphId = ? AND fileName = ?', [graphId, file.fileName])

    if (hasCompleteFileGraphRecords(graphId)) {
      persistAggregatedGraph(graphId, aggregateGraphFromFileRecords(graphId))
    } else {
      run('DELETE FROM edges WHERE graphId = ? AND sourceFile = ?', [graphId, file.fileName])

      const remainingEdges = allRows('SELECT source, target FROM edges WHERE graphId = ?', [graphId])
      const connectedNodes = new Set()
      for (const edge of remainingEdges) {
        connectedNodes.add(edge.source)
        connectedNodes.add(edge.target)
      }

      const fileNodes = allRows(
        'SELECT id, label FROM nodes WHERE graphId = ? AND sourceFile = ?',
        [graphId, file.fileName]
      )
      for (const node of fileNodes) {
        const supportedElsewhere = allRows(
          `
          SELECT 1
          FROM file_chunks
          WHERE graphId = ? AND fileId != ? AND (linkedNodes LIKE ? OR linkedEvents LIKE ?)
          LIMIT 1
          `,
          [graphId, fileId, `%\"${node.label}\"%`, `%\"${node.label}\"%`]
        ).length > 0

        if (!connectedNodes.has(node.id) && !supportedElsewhere) {
          run('DELETE FROM nodes WHERE id = ? AND graphId = ?', [node.id, graphId])
        }
      }

      const nodeCount = getRow('SELECT COUNT(*) as count FROM nodes WHERE graphId = ?', [graphId])
      const edgeCount = getRow('SELECT COUNT(*) as count FROM edges WHERE graphId = ?', [graphId])
      run(
        'UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
        [nodeCount?.count || 0, edgeCount?.count || 0, Date.now(), graphId]
      )
    }

    saveToDisk()
    await rebuildGraphDb(graphId)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/detail/:fileId', (req, res) => {
  try {
    run('DELETE FROM file_chunks WHERE fileId = ?', [req.params.fileId])
    run('DELETE FROM files WHERE id = ?', [req.params.fileId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:graphId/search', (req, res) => {
  try {
    const { keywords = [] } = req.body || {}
    const graphId = req.params.graphId
    let chunks = allRows(
      `
      SELECT id, fileId, fileName, paragraphIndex, content, linkedNodes, linkedEvents
      FROM file_chunks
      WHERE graphId = ?
      ORDER BY paragraphIndex ASC
      `,
      [graphId]
    )

    if (chunks.length === 0) {
      const graphNodes = allRows('SELECT label, type FROM nodes WHERE graphId = ?', [graphId])
      const files = allRows('SELECT id, fileName, content FROM files WHERE graphId = ?', [graphId])
      chunks = files.flatMap(file => splitIntoParagraphs(file.content).map((paragraph, index) => {
        const linked = collectLinkedLabels(paragraph, graphNodes)
        return {
          id: `${file.id}_${index + 1}`,
          fileId: file.id,
          fileName: file.fileName,
          paragraphIndex: index + 1,
          content: paragraph,
          linkedNodes: JSON.stringify(linked.linkedNodes),
          linkedEvents: JSON.stringify(linked.linkedEvents)
        }
      }))
    }

    const results = []
    for (const chunk of chunks) {
      const linkedNodes = parseJson(chunk.linkedNodes, [])
      const linkedEvents = parseJson(chunk.linkedEvents, [])
      const { score, matchedKeywords } = scoreParagraph(chunk.content, keywords, linkedNodes, linkedEvents)

      if (score <= 0) continue
      results.push({
        chunkId: chunk.id,
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        paragraphIndex: chunk.paragraphIndex,
        score,
        text: chunk.content,
        matchedKeywords: [...new Set(matchedKeywords)],
        linkedNodes,
        linkedEvents
      })
    }

    results.sort((a, b) => b.score - a.score || a.paragraphIndex - b.paragraphIndex)
    res.json(results.slice(0, 12))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
