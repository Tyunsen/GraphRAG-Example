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

function run(sql, params = []) {
  const db = getDB()
  db.run(sql, params)
}

// ── Get all messages for a graph ────────────────────────────
router.get('/:graphId', (req, res) => {
  try {
    const messages = allRows('SELECT * FROM messages WHERE graphId = ? ORDER BY timestamp ASC', [req.params.graphId]).map(m => ({
      ...m,
      context: m.context ? JSON.parse(m.context) : null
    }))
    res.json(messages)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Add a message ───────────────────────────────────────────
router.post('/:graphId', (req, res) => {
  try {
    const { id, role, content, context, timestamp } = req.body
    run(
      'INSERT INTO messages (id, graphId, role, content, context, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.params.graphId, role, content, context ? JSON.stringify(context) : null, timestamp || Date.now()]
    )
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Clear all messages for a graph ──────────────────────────
router.delete('/:graphId', (req, res) => {
  try {
    run('DELETE FROM messages WHERE graphId = ?', [req.params.graphId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
