import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { normalizeLabel } from '@/utils/textTokenizer'
import { generateEdgeId, generateId } from '@/utils/idGenerator'
import {
  createWorkspaceApi,
  deleteGraphApi,
  fetchGraph,
  fetchGraphList,
  removeImportApi,
  renameGraphApi,
  saveGraph as saveGraphApi
} from '@/services/apiClient'

const CURRENT_GRAPH_KEY = 'zstp-current-workspace'

function loadCurrentGraphId() {
  return localStorage.getItem(CURRENT_GRAPH_KEY) || null
}

export const useGraphStore = defineStore('graph', () => {
  const nodes = ref(new Map())
  const edges = ref(new Map())
  const labelIndex = ref(new Map())
  const adjacency = ref(new Map())
  const graphVersion = ref(0)
  const importHistory = ref([])
  const highlightedNodes = ref(new Set())
  const selectedNode = ref(null)
  const focusedNodeIds = ref(null)
  const focusedEdgeIds = ref(null)

  const savedGraphs = ref([])
  const currentGraphId = ref(loadCurrentGraphId())
  const backendReady = ref(false)
  const graphViewMode = ref('event')

  function isEventType(type) {
    return /事件|event/i.test(String(type || '').trim())
  }

  function isVisibleByMode(node) {
    if (!node) return false
    if (graphViewMode.value === 'all') return true
    if (graphViewMode.value === 'event') return isEventType(node.type)
    if (graphViewMode.value === 'entity') return !isEventType(node.type)
    return true
  }

  const nodeList = computed(() => {
    const baseNodes = !focusedNodeIds.value
      ? Array.from(nodes.value.values())
      : Array.from(focusedNodeIds.value)
      .map(nodeId => nodes.value.get(nodeId))
      .filter(Boolean)
    return baseNodes.filter(isVisibleByMode)
  })
  const edgeList = computed(() => {
    const visibleNodeIds = new Set(nodeList.value.map(node => node.id))
    const baseEdges = !focusedEdgeIds.value
      ? Array.from(edges.value.values())
      : Array.from(focusedEdgeIds.value)
      .map(edgeId => edges.value.get(edgeId))
      .filter(Boolean)
    return baseEdges.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  })
  const nodeCount = computed(() => nodes.value.size)
  const edgeCount = computed(() => edges.value.size)
  const isFocusedView = computed(() => focusedNodeIds.value instanceof Set)

  const typeSet = computed(() => {
    const types = new Set()
    for (const node of nodeList.value) {
      if (node.type) types.add(node.type)
    }
    return types
  })

  const currentGraphMeta = computed(() =>
    savedGraphs.value.find(item => item.id === currentGraphId.value) || null
  )
  const currentGraphName = computed(() => currentGraphMeta.value?.name || null)
  const currentIntentQuery = computed(() => currentGraphMeta.value?.intentQuery || '')

  function persistCurrentGraphId() {
    if (currentGraphId.value) localStorage.setItem(CURRENT_GRAPH_KEY, currentGraphId.value)
    else localStorage.removeItem(CURRENT_GRAPH_KEY)
  }

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
    if (!adjacency.value.has(id)) adjacency.value.set(id, new Set())
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

  function mergeGraph(parsedData, sourceFile) {
    const { nodes: newNodes = [], edges: newEdges = [] } = parsedData
    for (const node of newNodes) {
      node.sourceFile = sourceFile
      addNode(node)
    }
    for (const edge of newEdges) {
      edge.sourceFile = sourceFile
      addEdge(edge)
    }

    importHistory.value.push({
      id: generateId('imp'),
      fileName: sourceFile,
      timestamp: Date.now(),
      nodesAdded: newNodes.length,
      edgesAdded: newEdges.length
    })
    graphVersion.value++
    saveCurrentGraph(sourceFile)
  }

  async function removeImport(importId) {
    const record = importHistory.value.find(item => item.id === importId)
    if (!record) return

    const fileName = record.fileName
    for (const [edgeId, edge] of edges.value) {
      if (edge.sourceFile === fileName) {
        edges.value.delete(edgeId)
        adjacency.value.get(edge.source)?.delete(edgeId)
        adjacency.value.get(edge.target)?.delete(edgeId)
      }
    }

    for (const [nodeId, node] of nodes.value) {
      if (node.sourceFile === fileName) {
        const adj = adjacency.value.get(nodeId)
        if (!adj || adj.size === 0) {
          nodes.value.delete(nodeId)
          labelIndex.value.delete(normalizeLabel(node.label))
          adjacency.value.delete(nodeId)
        }
      }
    }

    importHistory.value = importHistory.value.filter(item => item.id !== importId)
    graphVersion.value++

    if (currentGraphId.value) {
      try {
        await removeImportApi(currentGraphId.value, importId)
      } catch (error) {
        console.warn('[graphStore] removeImport failed, falling back to save:', error.message)
        await saveCurrentGraph()
      }
    }
  }

  function clearGraph() {
    nodes.value.clear()
    edges.value.clear()
    labelIndex.value.clear()
    adjacency.value.clear()
    importHistory.value = []
    focusedNodeIds.value = null
    focusedEdgeIds.value = null
    highlightedNodes.value.clear()
    selectedNode.value = null
    graphVersion.value++
  }

  function bfsSubgraph(seedNodeIds, maxDepth = 2, maxNodes = 50) {
    const visited = new Set()
    const subEdges = new Set()
    let frontier = [...seedNodeIds]

    for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
      const nextFrontier = []
      for (const nodeId of frontier) {
        if (visited.has(nodeId) || visited.size >= maxNodes) continue
        visited.add(nodeId)
        const adj = adjacency.value.get(nodeId)
        if (!adj) continue
        for (const edgeId of adj) {
          subEdges.add(edgeId)
          const edge = edges.value.get(edgeId)
          if (!edge) continue
          const neighbor = edge.source === nodeId ? edge.target : edge.source
          if (!visited.has(neighbor)) nextFrontier.push(neighbor)
        }
      }
      frontier = nextFrontier
    }

    const subNodes = []
    for (const nodeId of visited) {
      const node = nodes.value.get(nodeId)
      if (node) subNodes.push(node)
    }

    const subEdgeList = []
    for (const edgeId of subEdges) {
      const edge = edges.value.get(edgeId)
      if (edge && visited.has(edge.source) && visited.has(edge.target)) subEdgeList.push(edge)
    }

    return { nodes: subNodes, edges: subEdgeList }
  }

  function setHighlightedNodes(nodeIds) {
    highlightedNodes.value = new Set(nodeIds)
    graphVersion.value++
  }

  function setSelectedNode(nodeOrId) {
    if (!nodeOrId) {
      selectedNode.value = null
      graphVersion.value++
      return
    }

    const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id
    selectedNode.value = nodes.value.get(nodeId) || null
    graphVersion.value++
  }

  function setGraphViewMode(mode) {
    graphViewMode.value = ['event', 'entity', 'all'].includes(mode) ? mode : 'all'
    if (selectedNode.value && !isVisibleByMode(selectedNode.value)) {
      selectedNode.value = null
    }
    graphVersion.value++
  }

  function focusSubgraph(subgraph) {
    if (!subgraph?.nodes?.length) {
      showFullGraph()
      return
    }

    focusedNodeIds.value = new Set(subgraph.nodes.map(node => node.id).filter(Boolean))
    focusedEdgeIds.value = new Set(
      (subgraph.edges || [])
        .filter(edge =>
          focusedNodeIds.value.has(edge.source) &&
          focusedNodeIds.value.has(edge.target)
        )
        .map(edge => edge.id)
    )
    selectedNode.value = null
    graphVersion.value++
  }

  function focusEvidenceItem(evidence, options = {}) {
    if (!evidence) {
      showFullGraph()
      clearHighlights()
      return
    }

    const labels = [
      ...(evidence.linkedNodes || []),
      ...(evidence.linkedEvents || [])
    ].filter(Boolean)

    const seedIds = [...new Set(labels.map(resolveNodeId).filter(Boolean))]

    if (seedIds.length === 0) {
      showFullGraph()
      clearHighlights()
      return
    }

    const maxDepth = options.maxDepth ?? 1
    const maxNodes = options.maxNodes ?? 28
    const subgraph = bfsSubgraph(seedIds, maxDepth, maxNodes)
    focusSubgraph(subgraph)
    setHighlightedNodes(seedIds)
    setSelectedNode(seedIds.length === 1 ? seedIds[0] : null)
  }

  function showFullGraph() {
    focusedNodeIds.value = null
    focusedEdgeIds.value = null
    selectedNode.value = null
    graphVersion.value++
  }

  function clearHighlights() {
    highlightedNodes.value.clear()
    graphVersion.value++
  }

  function serializeGraph() {
    return {
      nodes: Array.from(nodes.value.values()),
      edges: Array.from(edges.value.values()),
      importHistory: importHistory.value
    }
  }

  function deserializeGraph(data) {
    clearGraph()
    importHistory.value = data.importHistory || []

    for (const node of data.nodes || []) {
      nodes.value.set(node.id, node)
      labelIndex.value.set(normalizeLabel(node.label), node.id)
      adjacency.value.set(node.id, new Set())
    }

    for (const edge of data.edges || []) {
      edges.value.set(edge.id, edge)
      if (!adjacency.value.has(edge.source)) adjacency.value.set(edge.source, new Set())
      if (!adjacency.value.has(edge.target)) adjacency.value.set(edge.target, new Set())
      adjacency.value.get(edge.source).add(edge.id)
      adjacency.value.get(edge.target).add(edge.id)
    }

    graphVersion.value++
  }

  async function saveCurrentGraph(nameHint) {
    const id = currentGraphId.value
    if (!id) return

    const data = serializeGraph()
    const existing = currentGraphMeta.value
    try {
      await saveGraphApi(id, {
        name: existing?.name || nameHint || `工作区 ${savedGraphs.value.length + 1}`,
        intentQuery: existing?.intentQuery || '',
        intentSummary: existing?.intentSummary || '',
        nodes: data.nodes,
        edges: data.edges,
        importHistory: data.importHistory
      })
    } catch (error) {
      console.warn('[graphStore] save failed:', error.message)
    }

    if (existing) {
      existing.nodeCount = nodes.value.size
      existing.edgeCount = edges.value.size
      existing.updatedAt = Date.now()
    }
    persistCurrentGraphId()
  }

  async function loadGraph(graphId) {
    try {
      const data = await fetchGraph(graphId)
      deserializeGraph(data)
      currentGraphId.value = graphId
      const index = savedGraphs.value.findIndex(item => item.id === graphId)
      if (index !== -1) savedGraphs.value[index] = { ...savedGraphs.value[index], ...data }
      persistCurrentGraphId()
      return true
    } catch (error) {
      console.warn('[graphStore] load failed:', error.message)
      return false
    }
  }

  async function ensureCurrentGraphLoaded() {
    const graphId = currentGraphId.value
    if (!graphId) return false

    const meta = savedGraphs.value.find(item => item.id === graphId)
    if (!meta) return false

    const expectedNodes = Number(meta.nodeCount || 0)
    const expectedEdges = Number(meta.edgeCount || 0)
    const hasGraphData = nodes.value.size > 0 || edges.value.size > 0
    const shouldReload = !hasGraphData && (expectedNodes > 0 || expectedEdges > 0)
    if (!shouldReload) return false

    return loadGraph(graphId)
  }

  async function refreshGraphList() {
    try {
      const latest = await fetchGraphList()
      savedGraphs.value = latest
      await ensureCurrentGraphLoaded()
      return latest
    } catch (error) {
      console.warn('[graphStore] refresh list failed:', error.message)
      return savedGraphs.value
    }
  }

  async function createWorkspace({ name, intentQuery, intentSummary = '', extractionPrompt = '' }) {
    const id = generateId('g')
    const payload = {
      id,
      name: name?.trim() || '未命名工作区',
      intentQuery: intentQuery?.trim() || '',
      intentSummary: intentSummary?.trim() || '',
      extractionPrompt: extractionPrompt?.trim() || ''
    }
    const response = await createWorkspaceApi(payload)
    clearGraph()
    currentGraphId.value = id
    savedGraphs.value.unshift({
      ...payload,
      intentProfile: response?.intentProfile || {},
      extractionPrompt: response?.extractionPrompt || payload.extractionPrompt,
      nodeCount: 0,
      edgeCount: 0,
      fileCount: 0,
      sessionCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    persistCurrentGraphId()
  }

  async function deleteSavedGraph(graphId) {
    try {
      await deleteGraphApi(graphId)
    } catch (error) {
      console.warn('[graphStore] delete failed:', error.message)
    }

    savedGraphs.value = savedGraphs.value.filter(item => item.id !== graphId)
    if (currentGraphId.value === graphId) {
      clearGraph()
      currentGraphId.value = null
      persistCurrentGraphId()
    }
  }

  async function renameGraph(graphId, payload) {
    const entry = savedGraphs.value.find(item => item.id === graphId)
    if (!entry) return
    try {
      const response = await renameGraphApi(graphId, payload)
      Object.assign(entry, payload, {
        intentProfile: response?.intentProfile || entry.intentProfile || {},
        extractionPrompt: response?.extractionPrompt ?? payload.extractionPrompt ?? entry.extractionPrompt ?? ''
      })
    } catch (error) {
      console.warn('[graphStore] rename/update failed:', error.message)
    }
  }

  function syncCurrentGraphMeta(patch = {}) {
    const entry = savedGraphs.value.find(item => item.id === currentGraphId.value)
    if (!entry) return
    Object.assign(entry, patch)
  }

  function createNewGraph() {
    clearGraph()
    currentGraphId.value = null
    persistCurrentGraphId()
  }

  async function initFromBackend() {
    try {
      savedGraphs.value = await fetchGraphList()
      backendReady.value = true
      if (currentGraphId.value) {
        const loaded = await loadGraph(currentGraphId.value)
        if (!loaded) {
          currentGraphId.value = null
          persistCurrentGraphId()
          if (savedGraphs.value.length > 0) {
            currentGraphId.value = savedGraphs.value[0].id
            persistCurrentGraphId()
            await loadGraph(currentGraphId.value)
          }
        }
      } else if (savedGraphs.value.length > 0) {
        currentGraphId.value = savedGraphs.value[0].id
        persistCurrentGraphId()
        await loadGraph(currentGraphId.value)
      }
      await ensureCurrentGraphLoaded()
    } catch (error) {
      console.warn('[graphStore] backend unavailable:', error.message)
      backendReady.value = false
    }
  }

  initFromBackend()

  return {
    nodes,
    edges,
    labelIndex,
    adjacency,
    graphVersion,
    importHistory,
    highlightedNodes,
    selectedNode,
    isFocusedView,
    nodeList,
    edgeList,
    nodeCount,
    edgeCount,
    typeSet,
    currentGraphMeta,
    currentGraphName,
    currentIntentQuery,
    graphViewMode,
    getNodeDegree,
    addNode,
    addEdge,
    resolveNodeId,
    mergeGraph,
    removeImport,
    clearGraph,
    bfsSubgraph,
    setHighlightedNodes,
    setSelectedNode,
    setGraphViewMode,
    focusSubgraph,
    focusEvidenceItem,
    showFullGraph,
    clearHighlights,
    savedGraphs,
    currentGraphId,
    backendReady,
    saveCurrentGraph,
    loadGraph,
    refreshGraphList,
    syncCurrentGraphMeta,
    deleteSavedGraph,
    renameGraph,
    createNewGraph,
    createWorkspace
  }
})
