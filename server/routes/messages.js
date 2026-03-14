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

router.get('/session/:sessionId', (req, res) => {
  try {
    const messages = allRows(
      'SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC',
      [req.params.sessionId]
    ).map(message => ({
      ...message,
      context: message.context ? JSON.parse(message.context) : null
    }))
    res.json(messages)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/session/:sessionId', (req, res) => {
  try {
    const { id, graphId, role, content, context, timestamp } = req.body || {}
    run(
      `
      INSERT INTO messages (id, graphId, sessionId, role, content, context, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        graphId,
        req.params.sessionId,
        role,
        content,
        context ? JSON.stringify(context) : null,
        timestamp || Date.now()
      ]
    )
    run('UPDATE sessions SET updatedAt = ? WHERE id = ?', [Date.now(), req.params.sessionId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/session/:sessionId', (req, res) => {
  try {
    run('DELETE FROM messages WHERE sessionId = ?', [req.params.sessionId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
