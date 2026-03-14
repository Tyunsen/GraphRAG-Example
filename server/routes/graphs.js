import { Router } from 'express'
import { getDB, saveToDisk } from '../db.js'
import { deleteWorkspaceGraph, queryWorkspaceSubgraph, syncWorkspaceGraph } from '../graphdb.js'
import { rebuildCanonicalGraph } from '../knowledgePipeline.js'
import { buildIntentProfile } from '../workspaceIntent.js'

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

function deleteWorkspaceFileArtifacts(graphId) {
  run('DELETE FROM file_chunks WHERE graphId = ?', [graphId])
  run('DELETE FROM files WHERE graphId = ?', [graphId])
  run('DELETE FROM file_nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM file_edges WHERE graphId = ?', [graphId])
}

router.get('/', (req, res) => {
  try {
    const graphIds = allRows('SELECT id FROM graphs').map(row => row.id)
    let reconciled = false
    for (const graphId of graphIds) {
      reconciled = reconcileWorkspaceSourceState(graphId) || reconciled
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
    ).map(graph => ({
      ...graph,
      intentProfile: parseJson(graph.intentProfile, {})
    }))

    res.json(graphs)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', (req, res) => {
  try {
    const now = Date.now()
    const {
      id,
      name = '未命名工作区',
      intentQuery = '',
      intentSummary = ''
    } = req.body || {}

    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!String(intentQuery || '').trim()) {
      return res.status(400).json({ error: 'intentQuery is required' })
    }

    const intentProfile = buildIntentProfile(intentQuery, intentSummary)
    run(
      `
      INSERT INTO graphs (id, name, intentQuery, intentSummary, intentProfile, nodeCount, edgeCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `,
      [id, String(name).trim(), String(intentQuery).trim(), String(intentSummary).trim(), JSON.stringify(intentProfile), now, now]
    )

    saveToDisk()
    res.json({ success: true, id, intentProfile })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/:id', (req, res) => {
  try {
    let graph = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id])
    if (!graph) return res.status(404).json({ error: 'Workspace not found' })

    if (reconcileWorkspaceSourceState(req.params.id)) {
      saveToDisk()
      graph = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id])
    }

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
      intentProfile: parseJson(graph.intentProfile, {}),
      nodes,
      edges,
      importHistory
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

    if (existing) {
      run('DELETE FROM nodes WHERE graphId = ?', [id])
      run('DELETE FROM edges WHERE graphId = ?', [id])
      run('DELETE FROM import_history WHERE graphId = ?', [id])
      run(
        `
        UPDATE graphs
        SET name = ?, intentQuery = ?, intentSummary = ?, intentProfile = ?, nodeCount = ?, edgeCount = ?, updatedAt = ?
        WHERE id = ?
        `,
        [nextName, nextIntentQuery, nextIntentSummary, JSON.stringify(nextIntentProfile), nodes.length, edges.length, now, id]
      )
    } else {
      run(
        `
        INSERT INTO graphs (id, name, intentQuery, intentSummary, intentProfile, nodeCount, edgeCount, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [id, nextName, nextIntentQuery, nextIntentSummary, JSON.stringify(nextIntentProfile), nodes.length, edges.length, now, now]
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

    saveToDisk()
    await rebuildGraphDb(id)
    res.json({ success: true, intentProfile: nextIntentProfile })
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
      intentSummary = existing.intentSummary || ''
    } = req.body || {}

    const intentProfile = buildIntentProfile(intentQuery, intentSummary)
    run(
      'UPDATE graphs SET name = ?, intentQuery = ?, intentSummary = ?, intentProfile = ?, updatedAt = ? WHERE id = ?',
      [name, intentQuery, intentSummary, JSON.stringify(intentProfile), Date.now(), req.params.id]
    )

    saveToDisk()
    await rebuildGraphDb(req.params.id)
    res.json({ success: true, intentProfile })
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
    saveToDisk()
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

    saveToDisk()
    await rebuildGraphDb(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
