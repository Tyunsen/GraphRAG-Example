import neo4j from 'neo4j-driver'

let driver = null
let graphDbEnabled = false

function getGraphConfig() {
  return {
    uri: process.env.NEO4J_URI || '',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  }
}

function normalizeType(type = 'default') {
  const raw = String(type).trim().toLowerCase()
  if (raw === '\u4e8b\u4ef6' || raw === 'event') return 'Event'
  return 'Entity'
}

function sanitizeProperties(input = {}) {
  const output = {}
  for (const [key, value] of Object.entries(input || {})) {
    if (value == null) continue
    output[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return output
}

function toNodePayload(node) {
  return {
    id: node.properties.id,
    label: node.properties.label,
    type: node.properties.type || 'default',
    sourceFile: node.properties.sourceFile || '',
    properties: JSON.parse(node.properties.propertiesJson || '{}'),
    createdAt: Number(node.properties.createdAt?.toString?.() || Date.now())
  }
}

function toEdgePayload(rel) {
  return {
    id: rel.properties.edgeId,
    source: rel.startNodeElementId,
    target: rel.endNodeElementId,
    label: rel.properties.label || '',
    sourceFile: rel.properties.sourceFile || '',
    properties: JSON.parse(rel.properties.propertiesJson || '{}'),
    createdAt: Number(rel.properties.createdAt?.toString?.() || Date.now())
  }
}

export async function initGraphDB() {
  const config = getGraphConfig()

  if (!config.uri || !config.password) {
    graphDbEnabled = false
    return false
  }

  driver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.username, config.password)
  )

  try {
    await driver.verifyConnectivity()
    graphDbEnabled = true
    return true
  } catch (error) {
    console.warn('[graphdb] Neo4j unavailable:', error.message)
    graphDbEnabled = false
    return false
  }
}

export function isGraphDBEnabled() {
  return graphDbEnabled
}

export async function syncWorkspaceGraph(workspace, nodes = [], edges = []) {
  if (!graphDbEnabled || !driver || !workspace?.id) return

  const { database } = getGraphConfig()
  const session = driver.session({ database })
  const payloadNodes = nodes.map(node => ({
    id: node.id,
    label: node.label,
    type: node.type || 'default',
    kind: normalizeType(node.type),
    sourceFile: node.sourceFile || '',
    properties: sanitizeProperties(node.properties),
    createdAt: Number(node.createdAt || Date.now())
  }))
  const payloadEdges = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || '关联',
    sourceFile: edge.sourceFile || '',
    properties: sanitizeProperties(edge.properties),
    createdAt: Number(edge.createdAt || Date.now())
  }))

  try {
    await session.executeWrite(async tx => {
      await tx.run(
        `
        MERGE (w:Workspace {id: $workspaceId})
        SET w.name = $name,
            w.intentQuery = $intentQuery,
            w.intentSummary = $intentSummary,
            w.updatedAt = timestamp()
        WITH w
        OPTIONAL MATCH (w)-[:HAS_NODE]->(n)
        DETACH DELETE n
        `,
        {
          workspaceId: workspace.id,
          name: workspace.name || '工作区',
          intentQuery: workspace.intentQuery || '',
          intentSummary: workspace.intentSummary || ''
        }
      )

      for (const node of payloadNodes) {
        await tx.run(
          `
          MERGE (w:Workspace {id: $workspaceId})
          CREATE (n:KGNode:${node.kind} {
            id: $id,
            workspaceId: $workspaceId,
            label: $label,
            type: $type,
            sourceFile: $sourceFile,
            createdAt: $createdAt,
            propertiesJson: $propertiesJson
          })
          SET n += $properties
          MERGE (w)-[:HAS_NODE]->(n)
          `,
          {
            workspaceId: workspace.id,
            id: node.id,
            label: node.label,
            type: node.type,
            sourceFile: node.sourceFile,
            createdAt: neo4j.int(node.createdAt),
            properties: node.properties,
            propertiesJson: JSON.stringify(node.properties)
          }
        )
      }

      for (const edge of payloadEdges) {
        await tx.run(
          `
          MATCH (s:KGNode {id: $source, workspaceId: $workspaceId})
          MATCH (t:KGNode {id: $target, workspaceId: $workspaceId})
          MERGE (s)-[r:REL {edgeId: $edgeId, workspaceId: $workspaceId}]->(t)
          SET r.label = $label,
              r.sourceFile = $sourceFile,
              r.createdAt = $createdAt,
              r.propertiesJson = $propertiesJson
          SET r += $properties
          `,
          {
            workspaceId: workspace.id,
            edgeId: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            sourceFile: edge.sourceFile,
            createdAt: neo4j.int(edge.createdAt),
            properties: edge.properties,
            propertiesJson: JSON.stringify(edge.properties)
          }
        )
      }
    })
  } finally {
    await session.close()
  }
}

export async function queryWorkspaceSubgraph(workspaceId, labels = [], options = {}) {
  if (!graphDbEnabled || !driver || !workspaceId || labels.length === 0) {
    return { nodes: [], edges: [], seedLabels: [] }
  }

  const maxDepth = Math.max(1, Number(options.maxDepth || 2))
  const maxSeeds = Math.max(1, Number(options.maxSeeds || 12))
  const maxNodes = Math.max(10, Number(options.maxNodes || 80))
  const pathLimit = Math.max(20, Number(options.pathLimit || 200))
  const loweredLabels = labels.map(label => String(label || '').trim()).filter(Boolean)

  const { database } = getGraphConfig()
  const session = driver.session({ database })
  try {
    const seedResult = await session.executeRead(tx => tx.run(
      `
      MATCH (:Workspace {id: $workspaceId})-[:HAS_NODE]->(n:KGNode)
      WHERE any(label IN $labels WHERE
        toLower(n.label) = toLower(label) OR
        toLower(n.label) CONTAINS toLower(label) OR
        toLower(label) CONTAINS toLower(n.label)
      )
      RETURN DISTINCT n
      LIMIT $maxSeeds
      `,
      {
        workspaceId,
        labels: loweredLabels,
        maxSeeds: neo4j.int(maxSeeds)
      }
    ))

    const seedNodes = seedResult.records.map(record => record.get('n'))
    if (seedNodes.length === 0) {
      return { nodes: [], edges: [], seedLabels: [] }
    }

    const seedIds = seedNodes.map(node => node.properties.id)
    const nodeMap = new Map(seedNodes.map(node => [node.properties.id, toNodePayload(node)]))
    const edgeMap = new Map()

    const pathResult = await session.executeRead(tx => tx.run(
      `
      UNWIND $seedIds AS seedId
      MATCH (seed:KGNode {id: seedId, workspaceId: $workspaceId})
      OPTIONAL MATCH path = (seed)-[:REL*1..${maxDepth}]-(neighbor:KGNode {workspaceId: $workspaceId})
      RETURN seed, path
      LIMIT $pathLimit
      `,
      {
        workspaceId,
        seedIds,
        pathLimit: neo4j.int(pathLimit)
      }
    ))

    for (const record of pathResult.records) {
      const seed = record.get('seed')
      if (seed) nodeMap.set(seed.properties.id, toNodePayload(seed))

      const path = record.get('path')
      if (!path) continue

      for (const node of path.segments.flatMap(segment => [segment.start, segment.end])) {
        nodeMap.set(node.properties.id, toNodePayload(node))
      }

      for (const segment of path.segments) {
        edgeMap.set(segment.relationship.properties.edgeId, {
          ...toEdgePayload(segment.relationship),
          source: segment.start.properties.id,
          target: segment.end.properties.id
        })
      }
    }

    const nodes = Array.from(nodeMap.values()).slice(0, maxNodes)
    const allowed = new Set(nodes.map(node => node.id))
    const edges = Array.from(edgeMap.values()).filter(edge => allowed.has(edge.source) && allowed.has(edge.target))

    return {
      nodes,
      edges,
      seedLabels: seedNodes.map(node => node.properties.label)
    }
  } finally {
    await session.close()
  }
}

export async function deleteWorkspaceGraph(workspaceId) {
  if (!graphDbEnabled || !driver || !workspaceId) return
  const { database } = getGraphConfig()
  const session = driver.session({ database })
  try {
    await session.executeWrite(async tx => {
      await tx.run(
        `
        MATCH (w:Workspace {id: $workspaceId})-[:HAS_NODE]->(n)
        DETACH DELETE n
        `,
        { workspaceId }
      )
      await tx.run(
        'MATCH (w:Workspace {id: $workspaceId}) DETACH DELETE w',
        { workspaceId }
      )
    })
  } finally {
    await session.close()
  }
}

export async function closeGraphDB() {
  if (driver) {
    await driver.close()
  }
}
