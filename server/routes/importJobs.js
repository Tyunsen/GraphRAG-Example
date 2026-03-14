import { Router } from 'express'
import { getDB } from '../db.js'
import { createImportJob, getImportJob } from '../importJobs.js'

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

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

router.post('/:graphId', (req, res) => {
  try {
    const workspace = getRow('SELECT * FROM graphs WHERE id = ?', [req.params.graphId])
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

    const { files = [], options = {} } = req.body || {}
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files are required' })
    }

    const job = createImportJob({
      graphId: req.params.graphId,
      intentQuery: workspace.intentQuery || '',
      intentProfile: parseJson(workspace.intentProfile, {}),
      files,
      options
    })

    res.json(job)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/detail/:jobId', (req, res) => {
  try {
    const job = getImportJob(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Import job not found' })
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
