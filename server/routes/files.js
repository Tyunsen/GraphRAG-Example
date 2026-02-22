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

// ── List files for a graph (without content, for perf) ──────
router.get('/:graphId', (req, res) => {
  try {
    const files = allRows(
      'SELECT id, graphId, fileName, fileType, fileSize, importedAt FROM files WHERE graphId = ? ORDER BY importedAt DESC',
      [req.params.graphId]
    )
    res.json(files)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Get full file content ───────────────────────────────────
router.get('/detail/:fileId', (req, res) => {
  try {
    const file = getRow('SELECT * FROM files WHERE id = ?', [req.params.fileId])
    if (!file) return res.status(404).json({ error: 'File not found' })
    res.json(file)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Upload / save file content ──────────────────────────────
router.post('/:graphId', (req, res) => {
  try {
    const { id, fileName, content, fileType, fileSize } = req.body
    run(
      'INSERT INTO files (id, graphId, fileName, content, fileType, fileSize, importedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.graphId, fileName, content, fileType, fileSize || content.length, Date.now()]
    )
    saveToDisk()
    res.json({ success: true, id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Delete a file ───────────────────────────────────────────
router.delete('/detail/:fileId', (req, res) => {
  try {
    run('DELETE FROM files WHERE id = ?', [req.params.fileId])
    saveToDisk()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Search file content for RAG ─────────────────────────────
router.post('/:graphId/search', (req, res) => {
  try {
    const { keywords = [] } = req.body
    const graphId = req.params.graphId
    const allFiles = allRows('SELECT * FROM files WHERE graphId = ?', [graphId])

    const results = []
    for (const file of allFiles) {
      let score = 0
      const contentLower = file.content.toLowerCase()
      const matchedSnippets = []
      const usedRanges = [] // avoid overlapping snippets

      for (const kw of keywords) {
        const kwLower = kw.toLowerCase()
        let searchFrom = 0
        // Find ALL occurrences of this keyword
        while (searchFrom < contentLower.length) {
          const idx = contentLower.indexOf(kwLower, searchFrom)
          if (idx === -1) break
          score += 1
          // Extract larger snippet (800 chars context around match)
          const start = Math.max(0, idx - 400)
          const end = Math.min(file.content.length, idx + kw.length + 400)
          // Check overlap with existing snippets
          const overlaps = usedRanges.some(r => start < r.end && end > r.start)
          if (!overlaps) {
            matchedSnippets.push(file.content.slice(start, end))
            usedRanges.push({ start, end })
          }
          searchFrom = idx + kw.length
        }
      }

      if (score > 0) {
        results.push({
          fileId: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          score,
          snippets: matchedSnippets.slice(0, 10),
          // For high-scoring files, include full content (truncated to 6000 chars)
          fullContent: score >= 2 ? file.content.slice(0, 6000) : null
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    res.json(results.slice(0, 10))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
