import express from 'express'
import cors from 'cors'
import { initDB, saveToDiskSync } from './db.js'
import graphsRouter from './routes/graphs.js'
import messagesRouter from './routes/messages.js'
import filesRouter from './routes/files.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/graphs', graphsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/files', filesRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Init DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[zstp-server] Running on http://localhost:${PORT}`)
  })
}).catch(err => {
  console.error('[zstp-server] Failed to initialize database:', err)
  process.exit(1)
})

// Save DB to disk on exit
process.on('SIGINT', () => {
  saveToDiskSync()
  process.exit(0)
})
process.on('SIGTERM', () => {
  saveToDiskSync()
  process.exit(0)
})
