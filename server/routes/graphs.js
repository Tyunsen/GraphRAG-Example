import { Router } from 'express'
import { getDB, saveToDisk } from '../db.js'

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

// ── List all graphs ─────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const graphs = allRows('SELECT * FROM graphs ORDER BY updatedAt DESC')
    res.json(graphs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Get full graph data (nodes + edges + importHistory) ─────
router.get('/:id', (req, res) => {
  try {
    const graph = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.id])
    if (!graph) return res.status(404).json({ error: 'Graph not found' })

    const nodes = allRows('SELECT * FROM nodes WHERE graphId = ?', [req.params.id]).map(n => ({
      ...n,
      properties: JSON.parse(n.properties || '{}')
    }))
    const edges = allRows('SELECT * FROM edges WHERE graphId = ?', [req.params.id]).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }))
    const importHistory = allRows('SELECT * FROM import_history WHERE graphId = ? ORDER BY timestamp DESC', [req.params.id])

    res.json({ ...graph, nodes, edges, importHistory })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Save full graph (upsert graph + replace all nodes/edges) ─
router.put('/:id', (req, res) => {
  const { id } = req.params
  const { name, nodes = [], edges = [], importHistory = [] } = req.body

  try {
    const now = Date.now()
    const existing = getRow('SELECT * FROM graphs WHERE id = ?', [id])

    if (existing) {
      run('DELETE FROM nodes WHERE graphId = ?', [id])
      run('DELETE FROM edges WHERE graphId = ?', [id])
      run('DELETE FROM import_history WHERE graphId = ?', [id])
      run('UPDATE graphs SET name = ?, nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
        [name || existing.name, nodes.length, edges.length, now, id])
    } else {
      run('INSERT INTO graphs (id, name, nodeCount, edgeCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name || '图谱', nodes.length, edges.length, now, now])
    }

    for (const n of nodes) {
      run('INSERT OR REPLACE INTO nodes (id, graphId, label, type, properties, sourceFile, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [n.id, id, n.label, n.type || 'default', JSON.stringify(n.properties || {}), n.sourceFile || '', n.createdAt || now])
    }
    for (const e of edges) {
      run('INSERT OR REPLACE INTO edges (id, graphId, source, target, label, weight, properties, sourceFile, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [e.id, id, e.source, e.target, e.label || '', e.weight || 1, JSON.stringify(e.properties || {}), e.sourceFile || '', e.createdAt || now])
    }
    for (const h of importHistory) {
      run('INSERT OR REPLACE INTO import_history (id, graphId, fileName, timestamp, nodesAdded, edgesAdded) VALUES (?, ?, ?, ?, ?, ?)',
        [h.id, id, h.fileName, h.timestamp || now, h.nodesAdded || 0, h.edgesAdded || 0])
    }

    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Rename graph ────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    run('UPDATE graphs SET name = ?, updatedAt = ? WHERE id = ?', [name, Date.now(), req.params.id])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Delete graph (cascade manually) ─────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id
    run('DELETE FROM nodes WHERE graphId = ?', [id])
    run('DELETE FROM edges WHERE graphId = ?', [id])
    run('DELETE FROM import_history WHERE graphId = ?', [id])
    run('DELETE FROM messages WHERE graphId = ?', [id])
    run('DELETE FROM files WHERE graphId = ?', [id])
    run('DELETE FROM graphs WHERE id = ?', [id])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Remove import by importId ───────────────────────────────
router.delete('/:id/imports/:importId', (req, res) => {
  const { id, importId } = req.params

  try {
    const record = getRow('SELECT * FROM import_history WHERE id = ? AND graphId = ?', [importId, id])
    if (!record) return res.status(404).json({ error: 'Import not found' })

    // Delete edges from this file
    run('DELETE FROM edges WHERE graphId = ? AND sourceFile = ?', [id, record.fileName])

    // Get remaining edge sources/targets to check which nodes are still connected
    const remainingEdges = allRows('SELECT source, target FROM edges WHERE graphId = ?', [id])
    const connectedNodes = new Set()
    for (const e of remainingEdges) {
      connectedNodes.add(e.source)
      connectedNodes.add(e.target)
    }

    // Delete orphaned nodes from this file
    const fileNodes = allRows('SELECT id FROM nodes WHERE graphId = ? AND sourceFile = ?', [id, record.fileName])
    for (const n of fileNodes) {
      if (!connectedNodes.has(n.id)) {
        run('DELETE FROM nodes WHERE id = ? AND graphId = ?', [n.id, id])
      }
    }

    // Delete the import record
    run('DELETE FROM import_history WHERE id = ? AND graphId = ?', [importId, id])

    // Update counts
    const nc = getRow('SELECT COUNT(*) as count FROM nodes WHERE graphId = ?', [id])
    const ec = getRow('SELECT COUNT(*) as count FROM edges WHERE graphId = ?', [id])
    run('UPDATE graphs SET nodeCount = ?, edgeCount = ?, updatedAt = ? WHERE id = ?',
      [nc.count, ec.count, Date.now(), id])

    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
