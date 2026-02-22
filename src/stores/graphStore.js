import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { normalizeLabel } from '@/utils/textTokenizer'
import { generateId, generateEdgeId } from '@/utils/idGenerator'
import {
  fetchGraphList, fetchGraph, saveGraph as saveGraphApi,
  renameGraphApi, deleteGraphApi, removeImportApi
} from '@/services/apiClient'

// ── Fallback localStorage keys (only used if backend unavailable) ──
const CURRENT_GRAPH_KEY = 'zstp-current-graph'

function loadCurrentGraphId() {
  return localStorage.getItem(CURRENT_GRAPH_KEY) || null
}

export const useGraphStore = defineStore('graph', () => {
  // ── Core graph state ────────────────────────────────────
  const nodes = ref(new Map())
  const edges = ref(new Map())
  const labelIndex = ref(new Map())   // normalizedLabel -> nodeId
  const adjacency = ref(new Map())    // nodeId -> Set<edgeId>
  const graphVersion = ref(0)
  const importHistory = ref([])
  const highlightedNodes = ref(new Set())
  const selectedNode = ref(null)

  // ── Persistence state ───────────────────────────────────
  const savedGraphs = ref([])
  const currentGraphId = ref(loadCurrentGraphId())
  const backendReady = ref(false)

  // ── Computed ────────────────────────────────────────────
  const nodeList = computed(() => Array.from(nodes.value.values()))
  const edgeList = computed(() => Array.from(edges.value.values()))
  const nodeCount = computed(() => nodes.value.size)
  const edgeCount = computed(() => edges.value.size)

  const typeSet = computed(() => {
    const types = new Set()
    for (const node of nodes.value.values()) {
      if (node.type) types.add(node.type)
    }
    return types
  })

  const currentGraphName = computed(() => {
    if (!currentGraphId.value) return null
    const g = savedGraphs.value.find(g => g.id === currentGraphId.value)
    return g ? g.name : null
  })

  // ── Node / Edge operations ──────────────────────────────
  function getNodeDegree(nodeId) {
    const adj = adjacency.value.get(nodeId)
    return adj ? adj.size : 0
  }

  function addNode(node) {
    const normalized = normalizeLabel(node.label)
    if (labelIndex.value.has(normalized)) {
      const existingId = labelIndex.value.get(normalized)
      const existing = nodes.value.get(existingId)
      if (existing) {
        existing.properties = { ...existing.properties, ...node.properties }
        if (node.type && !existing.type) existing.type = node.type
      }
      return existingId
    }
    const id = node.id || generateId('n')
    const newNode = {
      id,
      label: node.label,
      type: node.type || 'default',
      properties: node.properties || {},
      sourceFile: node.sourceFile || '',
      createdAt: node.createdAt || Date.now()
    }
    nodes.value.set(id, newNode)
    labelIndex.value.set(normalized, id)
    if (!adjacency.value.has(id)) {
      adjacency.value.set(id, new Set())
    }
    return id
  }

  function resolveNodeId(labelOrId) {
    if (nodes.value.has(labelOrId)) return labelOrId
    const normalized = normalizeLabel(labelOrId)
    return labelIndex.value.get(normalized) || null
  }

  function addEdge(edge) {
    const sourceId = resolveNodeId(edge.source) || addNode({ label: edge.source, sourceFile: edge.sourceFile })
    const targetId = resolveNodeId(edge.target) || addNode({ label: edge.target, sourceFile: edge.sourceFile })
    const edgeKey = generateEdgeId(sourceId, targetId, edge.label)

    if (edges.value.has(edgeKey)) {
      const existing = edges.value.get(edgeKey)
      existing.weight = (existing.weight || 1) + 1
      return edgeKey
    }

    const newEdge = {
      id: edgeKey,
      source: sourceId,
      target: targetId,
      label: edge.label || '',
      weight: edge.weight || 1,
      properties: edge.properties || {},
      sourceFile: edge.sourceFile || '',
      createdAt: edge.createdAt || Date.now()
    }
    edges.value.set(edgeKey, newEdge)

    if (!adjacency.value.has(sourceId)) adjacency.value.set(sourceId, new Set())
    if (!adjacency.value.has(targetId)) adjacency.value.set(targetId, new Set())
    adjacency.value.get(sourceId).add(edgeKey)
    adjacency.value.get(targetId).add(edgeKey)

    return edgeKey
  }

  // ── Graph mutation (with auto-save) ─────────────────────
  function mergeGraph(parsedData, sourceFile) {
    const { nodes: newNodes = [], edges: newEdges = [] } = parsedData

    for (const n of newNodes) {
      n.sourceFile = sourceFile
      addNode(n)
    }
    for (const e of newEdges) {
      e.sourceFile = sourceFile
      addEdge(e)
    }

    importHistory.value.push({
      id: generateId('imp'),
      fileName: sourceFile,
      timestamp: Date.now(),
      nodesAdded: newNodes.length,
      edgesAdded: newEdges.length
    })

    graphVersion.value++

    // Auto-save: create new graph entry if none, then persist
    if (!currentGraphId.value) {
      currentGraphId.value = generateId('g')
    }
    saveCurrentGraph(sourceFile)
  }

  async function removeImport(importId) {
    const record = importHistory.value.find(h => h.id === importId)
    if (!record) return

    const fileName = record.fileName
    for (const [eid, edge] of edges.value) {
      if (edge.sourceFile === fileName) {
        edges.value.delete(eid)
        const srcAdj = adjacency.value.get(edge.source)
        if (srcAdj) srcAdj.delete(eid)
        const tgtAdj = adjacency.value.get(edge.target)
        if (tgtAdj) tgtAdj.delete(eid)
      }
    }
    for (const [nid, node] of nodes.value) {
      if (node.sourceFile === fileName) {
        const adj = adjacency.value.get(nid)
        if (!adj || adj.size === 0) {
          nodes.value.delete(nid)
          labelIndex.value.delete(normalizeLabel(node.label))
          adjacency.value.delete(nid)
        }
      }
    }

    importHistory.value = importHistory.value.filter(h => h.id !== importId)
    graphVersion.value++

    // Persist to backend
    if (currentGraphId.value) {
      try {
        await removeImportApi(currentGraphId.value, importId)
      } catch (e) {
        console.warn('[graphStore] Backend removeImport failed, saving full graph:', e.message)
        saveCurrentGraph()
      }
    }
  }

  function clearGraph() {
    nodes.value.clear()
    edges.value.clear()
    labelIndex.value.clear()
    adjacency.value.clear()
    importHistory.value = []
    highlightedNodes.value.clear()
    selectedNode.value = null
    graphVersion.value++
  }

  // ── BFS subgraph ────────────────────────────────────────
  function bfsSubgraph(seedNodeIds, maxDepth = 2, maxNodes = 50) {
    const visited = new Set()
    const subEdges = new Set()
    let frontier = [...seedNodeIds]

    for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
      const nextFrontier = []
      for (const nid of frontier) {
        if (visited.has(nid) || visited.size >= maxNodes) continue
        visited.add(nid)
        const adj = adjacency.value.get(nid)
        if (!adj) continue
        for (const eid of adj) {
          subEdges.add(eid)
          const edge = edges.value.get(eid)
          if (!edge) continue
          const neighbor = edge.source === nid ? edge.target : edge.source
          if (!visited.has(neighbor)) {
            nextFrontier.push(neighbor)
          }
        }
      }
      frontier = nextFrontier
    }

    const subNodes = []
    for (const nid of visited) {
      const node = nodes.value.get(nid)
      if (node) subNodes.push(node)
    }
    const subEdgeList = []
    for (const eid of subEdges) {
      const edge = edges.value.get(eid)
      if (edge && visited.has(edge.source) && visited.has(edge.target)) {
        subEdgeList.push(edge)
      }
    }
    return { nodes: subNodes, edges: subEdgeList }
  }

  // ── Highlights ──────────────────────────────────────────
  function setHighlightedNodes(nodeIds) {
    highlightedNodes.value = new Set(nodeIds)
    graphVersion.value++
  }

  function clearHighlights() {
    highlightedNodes.value.clear()
    graphVersion.value++
  }

  // ── Serialize / Deserialize ─────────────────────────────
  function serializeGraph() {
    return {
      nodes: Array.from(nodes.value.values()),
      edges: Array.from(edges.value.values()),
      importHistory: importHistory.value
    }
  }

  function deserializeGraph(data) {
    nodes.value.clear()
    edges.value.clear()
    labelIndex.value.clear()
    adjacency.value.clear()
    highlightedNodes.value.clear()
    selectedNode.value = null
    importHistory.value = data.importHistory || []

    for (const n of (data.nodes || [])) {
      nodes.value.set(n.id, n)
      labelIndex.value.set(normalizeLabel(n.label), n.id)
      adjacency.value.set(n.id, new Set())
    }

    for (const e of (data.edges || [])) {
      edges.value.set(e.id, e)
      if (!adjacency.value.has(e.source)) adjacency.value.set(e.source, new Set())
      if (!adjacency.value.has(e.target)) adjacency.value.set(e.target, new Set())
      adjacency.value.get(e.source).add(e.id)
      adjacency.value.get(e.target).add(e.id)
    }

    graphVersion.value++
  }

  function persistCurrentGraphId() {
    if (currentGraphId.value) {
      localStorage.setItem(CURRENT_GRAPH_KEY, currentGraphId.value)
    } else {
      localStorage.removeItem(CURRENT_GRAPH_KEY)
    }
  }

  // ── Persistence: public API (now uses backend) ──────────

  async function saveCurrentGraph(nameHint) {
    const id = currentGraphId.value
    if (!id) return

    const data = serializeGraph()
    const existing = savedGraphs.value.find(g => g.id === id)

    try {
      await saveGraphApi(id, {
        name: nameHint || (existing ? existing.name : `图谱 ${savedGraphs.value.length + 1}`),
        nodes: data.nodes,
        edges: data.edges,
        importHistory: data.importHistory
      })
    } catch (e) {
      console.warn('[graphStore] Failed to save graph to backend:', e.message)
    }

    // Update local list
    if (existing) {
      existing.nodeCount = nodes.value.size
      existing.edgeCount = edges.value.size
      existing.updatedAt = Date.now()
    } else {
      savedGraphs.value.push({
        id,
        name: nameHint || `图谱 ${savedGraphs.value.length + 1}`,
        nodeCount: nodes.value.size,
        edgeCount: edges.value.size,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    }

    persistCurrentGraphId()
  }

  async function loadGraph(graphId) {
    try {
      const data = await fetchGraph(graphId)
      if (!data) return false
      deserializeGraph(data)
      currentGraphId.value = graphId
      persistCurrentGraphId()
      return true
    } catch (e) {
      console.warn('[graphStore] Failed to load graph:', e.message)
      return false
    }
  }

  async function deleteSavedGraph(graphId) {
    try {
      await deleteGraphApi(graphId)
    } catch (e) {
      console.warn('[graphStore] Failed to delete graph from backend:', e.message)
    }

    savedGraphs.value = savedGraphs.value.filter(g => g.id !== graphId)

    if (currentGraphId.value === graphId) {
      clearGraph()
      currentGraphId.value = null
      persistCurrentGraphId()
    }
  }

  async function renameGraph(graphId, newName) {
    const entry = savedGraphs.value.find(g => g.id === graphId)
    if (entry) {
      entry.name = newName
      try {
        await renameGraphApi(graphId, newName)
      } catch (e) {
        console.warn('[graphStore] Failed to rename graph in backend:', e.message)
      }
    }
  }

  function createNewGraph() {
    clearGraph()
    currentGraphId.value = null
    persistCurrentGraphId()
  }

  // ── Init: restore from backend ──────────────────────────
  async function initFromBackend() {
    try {
      const list = await fetchGraphList()
      savedGraphs.value = list
      backendReady.value = true

      if (currentGraphId.value) {
        const loaded = await loadGraph(currentGraphId.value)
        if (!loaded) {
          currentGraphId.value = null
          persistCurrentGraphId()
        }
      }
    } catch (e) {
      console.warn('[graphStore] Backend unavailable, starting with empty state:', e.message)
      backendReady.value = false
    }
  }

  // Auto-init from backend
  initFromBackend()

  return {
    // Core state
    nodes, edges, labelIndex, adjacency, graphVersion,
    importHistory, highlightedNodes, selectedNode,
    // Computed
    nodeList, edgeList, nodeCount, edgeCount, typeSet, currentGraphName,
    // Core operations
    getNodeDegree, addNode, addEdge, resolveNodeId,
    mergeGraph, removeImport, clearGraph,
    bfsSubgraph, setHighlightedNodes, clearHighlights,
    // Persistence
    savedGraphs, currentGraphId, backendReady,
    saveCurrentGraph, loadGraph, deleteSavedGraph, renameGraph, createNewGraph
  }
})
