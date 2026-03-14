import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDB, saveToDiskSync } from './db.js'
import { closeGraphDB, initGraphDB, isGraphDBEnabled } from './graphdb.js'
import graphsRouter from './routes/graphs.js'
import messagesRouter from './routes/messages.js'
import filesRouter from './routes/files.js'
import sessionsRouter from './routes/sessions.js'

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
const LLM_API_BASE_URL = (process.env.LLM_API_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/+$/, '')
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL_NAME = process.env.LLM_MODEL_NAME || 'MiniMax-M2.5'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '../dist')

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/graphs', graphsRouter)
app.use('/api/workspaces', graphsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/files', filesRouter)
app.use('/api/sessions', sessionsRouter)

app.post('/api/llm/chat/completions', async (req, res) => {
  if (!LLM_API_KEY) {
    return res.status(500).json({ error: 'LLM_API_KEY is not configured on server.' })
  }

  const upstreamBody = {
    ...req.body,
    model: req.body?.model || LLM_MODEL_NAME,
    stream: false
  }

  try {
    const response = await fetch(`${LLM_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`
      },
      body: JSON.stringify(upstreamBody)
    })

    const text = await response.text()
    res.status(response.status)
    res.type(response.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (error) {
    res.status(502).json({ error: `Failed to reach upstream LLM API: ${error.message}` })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', graphDbReady: isGraphDBEnabled() })
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

Promise.all([initDB(), initGraphDB()]).then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`[zstp-server] Running on http://${HOST}:${PORT}`)
  })
}).catch(err => {
  console.error('[zstp-server] Failed to initialize database:', err)
  process.exit(1)
})

process.on('SIGINT', () => {
  saveToDiskSync()
  closeGraphDB()
  process.exit(0)
})
process.on('SIGTERM', () => {
  saveToDiskSync()
  closeGraphDB()
  process.exit(0)
})
