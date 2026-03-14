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
      nodes = []
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

    saveToDisk()
    res.json({ success: true, id, paragraphCount: paragraphs.length })
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
