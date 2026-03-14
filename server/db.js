import initSqlJs from 'sql.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DATA_DIR = join(__dirname, 'data')
const DB_PATH = join(DATA_DIR, 'zstp.db')

mkdirSync(DATA_DIR, { recursive: true })

let db = null
let saveTimer = null

function ensureColumn(tableName, columnSql) {
  try {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`)
  } catch {
    // Column already exists.
  }
}

async function initDB() {
  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS graphs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nodeCount INTEGER DEFAULT 0,
      edgeCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `)
  ensureColumn('graphs', "intentQuery TEXT DEFAULT ''")
  ensureColumn('graphs', "intentSummary TEXT DEFAULT ''")
  ensureColumn('graphs', "intentProfile TEXT DEFAULT '{}'")
  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT NOT NULL,
      graphId TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT DEFAULT 'default',
      properties TEXT DEFAULT '{}',
      sourceFile TEXT DEFAULT '',
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (id, graphId)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT NOT NULL,
      graphId TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      label TEXT DEFAULT '',
      weight INTEGER DEFAULT 1,
      properties TEXT DEFAULT '{}',
      sourceFile TEXT DEFAULT '',
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (id, graphId)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS import_history (
      id TEXT NOT NULL,
      graphId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      nodesAdded INTEGER DEFAULT 0,
      edgesAdded INTEGER DEFAULT 0,
      PRIMARY KEY (id, graphId)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      sessionId TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT,
      timestamp INTEGER NOT NULL
    )
  `)
  ensureColumn('messages', 'sessionId TEXT')
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      title TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      content TEXT NOT NULL,
      fileType TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      importedAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS file_chunks (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      paragraphIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      linkedNodes TEXT DEFAULT '[]',
      linkedEvents TEXT DEFAULT '[]',
      importedAt INTEGER NOT NULL
    )
  `)
  ensureColumn('file_chunks', "chunkKind TEXT DEFAULT 'paragraph'")
  ensureColumn('file_chunks', 'segmentIndex INTEGER DEFAULT 0')
  ensureColumn('file_chunks', "parentChunkId TEXT DEFAULT ''")
  db.run(`
    CREATE TABLE IF NOT EXISTS file_nodes (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      nodeLabel TEXT NOT NULL,
      nodeType TEXT DEFAULT 'default',
      nodeProperties TEXT DEFAULT '{}',
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS file_edges (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      sourceLabel TEXT NOT NULL,
      targetLabel TEXT NOT NULL,
      label TEXT DEFAULT '',
      edgeProperties TEXT DEFAULT '{}',
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS entity_mentions (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      canonicalKey TEXT NOT NULL,
      mentionText TEXT NOT NULL,
      entityType TEXT DEFAULT 'default',
      paragraphRefs TEXT DEFAULT '[]',
      chunkId TEXT DEFAULT '',
      properties TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0.0,
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS event_mentions (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      canonicalKey TEXT NOT NULL,
      label TEXT NOT NULL,
      eventType TEXT DEFAULT '一般事件',
      trigger TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      subjectKeys TEXT DEFAULT '[]',
      predicateText TEXT DEFAULT '',
      objectKeys TEXT DEFAULT '[]',
      timeText TEXT DEFAULT '',
      locationText TEXT DEFAULT '',
      paragraphRefs TEXT DEFAULT '[]',
      chunkId TEXT DEFAULT '',
      properties TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0.0,
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS relation_mentions (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      sourceKind TEXT NOT NULL,
      sourceKey TEXT NOT NULL,
      targetKind TEXT NOT NULL,
      targetKey TEXT NOT NULL,
      label TEXT NOT NULL,
      paragraphRefs TEXT DEFAULT '[]',
      chunkId TEXT DEFAULT '',
      properties TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0.0,
      createdAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS canonical_entities (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      canonicalKey TEXT NOT NULL,
      label TEXT NOT NULL,
      entityType TEXT DEFAULT 'default',
      aliases TEXT DEFAULT '[]',
      properties TEXT DEFAULT '{}',
      supportCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS canonical_events (
      id TEXT PRIMARY KEY,
      graphId TEXT NOT NULL,
      canonicalKey TEXT NOT NULL,
      label TEXT NOT NULL,
      eventType TEXT DEFAULT '一般事件',
      trigger TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      subjectKeys TEXT DEFAULT '[]',
      predicateText TEXT DEFAULT '',
      objectKeys TEXT DEFAULT '[]',
      timeText TEXT DEFAULT '',
      locationText TEXT DEFAULT '',
      aliases TEXT DEFAULT '[]',
      properties TEXT DEFAULT '{}',
      supportCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `)

  // Create indexes (IF NOT EXISTS is not supported for indexes in sql.js, use try/catch)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_nodes_graphId ON nodes(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_edges_graphId ON edges(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_import_history_graphId ON import_history(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_messages_graphId ON messages(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_messages_sessionId ON messages(sessionId)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_graphId ON sessions(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_files_graphId ON files(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_file_chunks_graphId ON file_chunks(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_file_chunks_fileId ON file_chunks(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_file_chunks_kind ON file_chunks(graphId, chunkKind)',
    'CREATE INDEX IF NOT EXISTS idx_file_nodes_graphId ON file_nodes(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_file_nodes_fileId ON file_nodes(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_file_edges_graphId ON file_edges(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_file_edges_fileId ON file_edges(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_entity_mentions_graphId ON entity_mentions(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_entity_mentions_fileId ON entity_mentions(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_event_mentions_graphId ON event_mentions(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_event_mentions_fileId ON event_mentions(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_relation_mentions_graphId ON relation_mentions(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_relation_mentions_fileId ON relation_mentions(fileId)',
    'CREATE INDEX IF NOT EXISTS idx_canonical_entities_graphId ON canonical_entities(graphId)',
    'CREATE INDEX IF NOT EXISTS idx_canonical_events_graphId ON canonical_events(graphId)',
  ]
  for (const sql of indexes) {
    try { db.run(sql) } catch { /* index may already exist */ }
  }

  // Persist to disk
  saveToDisk()

  return db
}

function saveToDisk() {
  if (!db) return
  // Debounced save to avoid excessive writes
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const data = db.export()
      const buffer = Buffer.from(data)
      writeFileSync(DB_PATH, buffer)
    } catch (e) {
      console.error('[db] Failed to save to disk:', e.message)
    }
  }, 100)
}

function saveToDiskSync() {
  if (!db) return
  if (saveTimer) clearTimeout(saveTimer)
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(DB_PATH, buffer)
  } catch (e) {
    console.error('[db] Failed to save to disk:', e.message)
  }
}

function getDB() {
  return db
}

export { initDB, getDB, saveToDisk, saveToDiskSync }
