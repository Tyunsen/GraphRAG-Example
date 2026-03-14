import { Router } from 'express'
import { getDB, saveToDisk } from '../db.js'
import { deleteWorkspaceGraph, queryWorkspaceSubgraph, syncWorkspaceGraph } from '../graphdb.js'

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
  const nodes = allRows('SELECT * FROM nodes WHERE graphId = ?', [graphId]).map(n => ({
    ...n,
    properties: parseJson(n.properties, {})
  }))
  const edges = allRows('SELECT * FROM edges WHERE graphId = ?', [graphId]).map(e => ({
    ...e,
    properties: parseJson(e.properties, {})
  }))
  await syncWorkspaceGraph(workspace, nodes, edges)
}

function clearWorkspaceGraphData(graphId) {
  run('DELETE FROM nodes WHERE graphId = ?', [graphId])
  run('DELETE FROM edges WHERE graphId = ?', [graphId])
  run('DELETE FROM import_history WHERE graphId = ?', [graphId])
  run(
    'UPDATE graphs SET nodeCount = 0, edgeCount = 0, updatedAt = ? WHERE id = ?',
    [Date.now(), graphId]
  )
}

function reconcileWorkspaceSourceState(graphId) {
  const fileCountRow = getRow('SELECT COUNT(*) as count FROM files WHERE graphId = ?', [graphId])
  const fileCount = Number(fileCountRow?.count || 0)
  if (fileCount > 0) return false

  const nodeCountRow = getRow('SELECT COUNT(*) as count FROM nodes WHERE graphId = ?', [graphId])
  const edgeCountRow = getRow('SELECT COUNT(*) as count FROM edges WHERE graphId = ?', [graphId])
  const nodeCount = Number(nodeCountRow?.count || 0)
  const edgeCount = Number(edgeCountRow?.count || 0)

  if (nodeCount === 0 && edgeCount === 0) return false
  clearWorkspaceGraphData(graphId)
  return true
}

router.get('/', (req, res) => {
  try {
    const graphIds = allRows('SELECT id FROM graphs').map(item => item.id)
    let hasReconciled = false
    for (const graphId of graphIds) {
      hasReconciled = reconcileWorkspaceSourceState(graphId) || hasReconciled
    }
    if (hasReconciled) saveToDisk()

    const graphs = allRows(`
      SELECT
        g.*,
        (SELECT COUNT(*) FROM files f WHERE f.graphId = g.id) as fileCount,
        (SELECT COUNT(*) FROM sessions s WHERE s.graphId = g.id) as sessionCount
      FROM graphs g
      ORDER BY g.updatedAt DESC
    `)
    res.json(graphs)
  } catch (e) {
    res.status(500).json({ error: e.message })
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
    if (!intentQuery.trim()) return res.status(400).json({ error: 'intentQuery is required' })

    run(
      `
      INSERT INTO graphs (id, name, intentQuery, intentSummary, nodeCount, edgeCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `,
      [id, name.trim(), intentQuery.trim(), intentSummary.trim(), now, now]
    )

    saveToDisk()
    res.json({ success: true, id })
  } catch (e) {
    res.status(500).json({ error: e.message })
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

    const nodes = allRows('SELECT * FROM nodes WHERE graphId = ?', [req.params.id]).map(n => ({
      ...n,
      properties: parseJson(n.properties, {})
    }))
    const edges = allRows('SELECT * FROM edges WHERE graphId = ?', [req.params.id]).map(e => ({
      ...e,
      properties: parseJson(e.properties, {})
    }))
    const importHistory = allRows(
      'SELECT * FROM import_history WHERE graphId = ? ORDER BY timestamp DESC',
      [req.params.id]
    )

    res.json({ ...graph, nodes, edges, importHistory })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:id/context', async (req, res) => {
  try {
    const graph = getRow('SELECT id FROM graphs WHERE id = ?', [req.params.id])
    if (!graph) return res.status(404).json({ error: 'Workspace not found' })

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
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const {
    name,
    intentQuery = '',
    intentSummary = '',
    nodes = [],
    edges = [],
    importHistory = []
  } = req.body || {}

  try {
    const now = Date.now()
    const existing = getRow('SELECT * FROM graphs WHERE id = ?', [id])

    if (existing) {
      run('DELETE FROM nodes WHERE graphId = ?', [id])
      run('DELETE FROM edges WHERE graphId = ?', [id])
      run('DELETE FROM import_history WHERE graphId = ?', [id])
      run(
        `
        UPDATE graphs
        SET name = ?, intentQuery = ?, intentSummary = ?, nodeCount = ?, edgeCount = ?, updatedAt = ?
        WHERE id = ?
        `,
        [
          name || existing.name,
          intentQuery || existing.intentQuery || '',
          intentSummary || existing.intentSummary || '',
          nodes.length,
          edges.length,
          now,
          id
        ]
      )
    } else {
      run(
        `
        INSERT INTO graphs (id, name, intentQuery, intentSummary, nodeCount, edgeCount, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [id, name || '未命名工作区', intentQuery, intentSummary, nodes.length, edges.length, now, now]
      )
    }

    for (const n of nodes) {
      run(
        `
        INSERT OR REPLACE INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [n.id, id, n.label, n.type || 'default', JSON.stringify(n.properties || {}), n.sourceFile || '', n.createdAt || now]
      )
    }

    for (const e of edges) {
      run(
        `
        INSERT OR REPLACE INTO edges (id, graphId, source, target, label, weight, properties, sourceFile, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          e.id,
          id,
          e.source,
          e.target,
          e.label || '',
          e.weight || 1,
          JSON.stringify(e.properties || {}),
          e.sourceFile || '',
          e.createdAt || now
        ]
      )
    }

    for (const h of importHistory) {
      run(
        `
        INSERT OR REPLACE INTO import_history (id, graphId, fileName, timestamp, nodesAdded, edgesAdded)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [h.id, id, h.fileName, h.timestamp || now, h.nodesAdded || 0, h.edgesAdded || 0]
      )
    }

    saveToDisk()
    await rebuildGraphDb(id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
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

    run(
      'UPDATE graphs SET name = ?, intentQuery = ?, intentSummary = ?, updatedAt = ? WHERE id = ?',
      [name, intentQuery, intentSummary, Date.now(), req.params.id]
    )
    saveToDisk()
    await rebuildGraphDb(req.params.id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    run('DELETE FROM nodes WHERE graphId = ?', [id])
    run('DELETE FROM edges WHERE graphId = ?', [id])
    run('DELETE FROM import_history WHERE graphId = ?', [id])
    run('DELETE FROM messages WHERE graphId = ?', [id])
    run('DELETE FROM sessions WHERE graphId = ?', [id])
    run('DELETE FROM file_chunks WHERE graphId = ?', [id])
    run('DELETE FROM files WHERE graphId = ?', [id])
    run('DELETE FROM graphs WHERE id = ?', [id])
    saveToDisk()
    await deleteWorkspaceGraph(id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id/imports/:importId', async (req, res) => {
  const { id, importId } = req.params

  try {
    const record = getRow('SELECT * FROM import_history WHERE id = ? AND graphId = ?', [importId, id])
    if (!record) return res.status(404).json({ error: 'Import not found' })

    run('DELETE FROM edges WHERE graphId = ? AND sourceFile = ?', [id, record.fileName])

    const remainingEdges = allRows('SELECT source, target FROM edges WHERE graphId = ?', [id])
    const connectedNodes = new Set()
    for (const edge of remainingEdges) {
      connectedNodes.add(edge.source)
      connectedNodes.add(edge.target)
    }

    const fileNodes = allRows('SELECT id FROM nodes WHERE graphId = ? AND sourceFile = ?', [id, record.fileName])
    for (const node of fileNodes) {
      if (!connectedNodes.has(node.id)) {
        run('DELETE FROM nodes WHERE id = ? AND graphId = ?', [node.id, id])
      }
    }

    const file = getRow('SELECT id FROM files WHERE graphId = ? AND fileName = ?', [id, record.fileName])
    if (file?.id) {
      run('DELETE FROM file_chunks WHERE fileId = ?', [file.id])
      run('DELETE FROM files WHERE id = ?', [file.id])
    }

    run('DELETE FROM import_history WHERE id = ? AND graphId = ?', [importId, id])

    const nc = getRow('SELECT COUNT(*) as count FROM nodes WHERE graphId = ?', [id])
    const ec = getRow('SELECT COUNT(*) as count FROM edges WHERE graphId = ?', [id])
    run(
      'UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
      [nc.count, ec.count, Date.now(), id]
    )

    saveToDisk()
    await rebuildGraphDb(id)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
