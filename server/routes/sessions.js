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

router.get('/:graphId', (req, res) => {
  try {
    const sessions = allRows(
      'SELECT * FROM sessions WHERE graphId = ? ORDER BY updatedAt DESC, createdAt DESC',
      [req.params.graphId]
    )
    res.json(sessions)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:graphId', (req, res) => {
  try {
    const { id, title = '新会话' } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })
    const now = Date.now()
    run(
      'INSERT INTO sessions (id, graphId, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [id, req.params.graphId, title, now, now]
    )
    saveToDisk()
    res.json({ success: true, id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/detail/:sessionId', (req, res) => {
  try {
    const session = getRow('SELECT * FROM sessions WHERE id = ?', [req.params.sessionId])
    if (!session) return res.status(404).json({ error: 'Session not found' })
    const { title = session.title } = req.body || {}
    run('UPDATE sessions SET title = ?, updatedAt = ? WHERE id = ?', [title, Date.now(), req.params.sessionId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/detail/:sessionId', (req, res) => {
  try {
    run('DELETE FROM messages WHERE sessionId = ?', [req.params.sessionId])
    run('DELETE FROM sessions WHERE id = ?', [req.params.sessionId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
