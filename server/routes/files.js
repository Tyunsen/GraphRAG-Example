import { Router } from 'express'
import {
  deleteImportedFile,
  getFileDetail,
  listWorkspaceFiles,
  persistImportedFile,
  searchWorkspaceFiles
} from '../fileGraphService.js'

const router = Router()

router.get('/:graphId', (req, res) => {
  try {
    res.json(listWorkspaceFiles(req.params.graphId))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/detail/:fileId', (req, res) => {
  try {
    const detail = getFileDetail(req.params.fileId)
    if (!detail) return res.status(404).json({ error: 'File not found' })
    res.json(detail)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/:graphId', async (req, res) => {
  try {
    const result = await persistImportedFile({
      graphId: req.params.graphId,
      ...req.body
    })
    res.json({
      success: true,
      id: result.id,
      paragraphCount: result.counts.paragraphCount,
      segmentCount: result.counts.segmentCount,
      entityMentionCount: result.counts.entityMentionCount,
      eventMentionCount: result.counts.eventMentionCount,
      relationMentionCount: result.counts.relationMentionCount,
      graph: result.graph
    })
  } catch (error) {
    if (error.message === 'Workspace not found') {
      return res.status(404).json({ error: error.message })
    }
    if (error.message === 'id, fileName and content are required') {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: error.message })
  }
})

router.delete('/:graphId/detail/:fileId', async (req, res) => {
  try {
    const graph = await deleteImportedFile(req.params.graphId, req.params.fileId)
    res.json({ success: true, graph })
  } catch (error) {
    if (error.message === 'File not found') {
      return res.status(404).json({ error: error.message })
    }
    res.status(500).json({ error: error.message })
  }
})

router.delete('/detail/:fileId', async (req, res) => {
  try {
    const detail = getFileDetail(req.params.fileId)
    if (!detail) return res.status(404).json({ error: 'File not found' })
    const graph = await deleteImportedFile(detail.graphId, detail.id)
    res.json({ success: true, graph })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/:graphId/search', (req, res) => {
  try {
    const { keywords = [] } = req.body || {}
    res.json(searchWorkspaceFiles(req.params.graphId, keywords))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
