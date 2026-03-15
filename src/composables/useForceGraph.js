import { ref, onUnmounted } from 'vue'
import * as d3 from 'd3'
import { getColorForType, getNodeRadius } from '@/utils/colorScale'

export function useForceGraph(graphStore) {
  const hoveredNode = ref(null)
  const tooltipX = ref(0)
  const tooltipY = ref(0)
  const currentLayout = ref('force')

  let simulation = null
  let zoomBehavior = null
  let svgEl = null
  let gEl = null
  let containerEl = null
  let width = 800
  let height = 600
  let nodes = []
  let links = []

  // ── Init ──────────────────────────────────────────────
  function init(container, svg, g) {
    containerEl = container
    svgEl = svg
    gEl = g
    updateDimensions()
    setupZoom()
  }

  function updateDimensions() {
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    width = rect.width || 800
    height = rect.height || 600
  }

  function setupZoom() {
    zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        d3.select(gEl).attr('transform', event.transform)
      })
    d3.select(svgEl)
      .call(zoomBehavior)
      .on('dblclick.zoom', null)
      .on('click.background', (event) => {
        // Only fire if the click target is the SVG itself
        if (event.target === svgEl) {
          graphStore.setSelectedNode(null)
          graphStore.clearHighlights()
        }
      })
  }

  // ── Update (called on data change) ───────────────────
  function update() {
    if (!gEl) return
    updateDimensions()
    buildData()
    resolveLinks()
    renderElements()

    if (currentLayout.value === 'force') {
      runForceLayout()
    } else {
      applyStaticLayout(currentLayout.value)
      ticked()
    }
  }

  // ── Build node/link arrays from store ─────────────────
  function buildData() {
    const oldMap = new Map()
    for (const n of nodes) {
      oldMap.set(n.id, { x: n.x, y: n.y })
    }

    nodes = graphStore.nodeList.map(n => {
      const old = oldMap.get(n.id)
      const degree = graphStore.getNodeDegree(n.id)
      return {
        id: n.id,
        label: n.label,
        type: n.type,
        properties: n.properties || {},
        sourceFile: n.sourceFile,
        degree,
        color: getColorForType(n.type),
        radius: getNodeRadius(degree),
        highlighted: graphStore.highlightedNodes.has(n.id),
        x: old?.x ?? (width / 2 + (Math.random() - 0.5) * 300),
        y: old?.y ?? (height / 2 + (Math.random() - 0.5) * 300)
      }
    })

    const nodeIdSet = new Set(nodes.map(n => n.id))
    links = graphStore.edgeList
      .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || '',
        weight: e.weight || 1
      }))
  }

  function resolveLinks() {
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    for (const link of links) {
      if (typeof link.source === 'string') link.source = nodeMap.get(link.source) || link.source
      if (typeof link.target === 'string') link.target = nodeMap.get(link.target) || link.target
    }
  }

  // ── D3 DOM rendering (enter/update/exit) ──────────────
  function renderElements() {
    const g = d3.select(gEl)

    // Edges (render first so nodes appear on top)
    const edgeSel = g.selectAll('g.graph-edge').data(links, d => d.id)
    edgeSel.exit().remove()
    const edgeEnter = edgeSel.enter().append('g').attr('class', 'graph-edge')
    edgeEnter.append('line')
    edgeEnter.append('text').attr('class', 'graph-edge-label')
    const edgeMerge = edgeEnter.merge(edgeSel)
    edgeMerge.select('line').attr('stroke-width', d => Math.min(d.weight, 5))
    edgeMerge.select('text').text(d => d.label)

    // Nodes
    const nodeSel = g.selectAll('g.graph-node').data(nodes, d => d.id)
    nodeSel.exit().remove()
    const nodeEnter = nodeSel.enter().append('g').attr('class', 'graph-node')
    nodeEnter.append('circle').attr('class', 'node-hit-area')
    nodeEnter.append('circle').attr('class', 'node-circle')
    nodeEnter.append('text').attr('class', 'graph-node-label')

    const nodeMerge = nodeEnter.merge(nodeSel)
    nodeMerge.select('.node-hit-area').attr('r', d => d.radius + 10)
    nodeMerge.select('.node-circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .classed('highlighted', d => d.highlighted)
    nodeMerge.select('.graph-node-label')
      .attr('dy', d => d.radius + 14)
      .text(d => d.label)

    // Bind D3 drag
    nodeMerge.call(
      d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded)
    )

    // Bind mouse/click events directly via D3
    nodeMerge
      .on('mouseenter', (event, d) => {
        hoveredNode.value = d
        updateTooltip(event)
      })
      .on('mousemove', (event) => {
        updateTooltip(event)
      })
      .on('mouseleave', () => {
        hoveredNode.value = null
      })
      .on('click', (event, d) => {
        event.stopPropagation()
        graphStore.setSelectedNode(graphStore.selectedNode?.id === d.id ? null : d.id)
      })
  }

  function updateTooltip(event) {
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    tooltipX.value = event.clientX - rect.left + 16
    tooltipY.value = event.clientY - rect.top + 16
  }

  // ── Tick: D3 updates DOM positions directly ───────────
  function ticked() {
    const g = d3.select(gEl)
    g.selectAll('g.graph-node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
    g.selectAll('g.graph-edge line')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)
    g.selectAll('g.graph-edge text')
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2 - 4)
  }

  // ── Force layout ──────────────────────────────────────
  function runForceLayout() {
    if (simulation) simulation.stop()
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(d => d.radius + 5))
      .on('tick', ticked)
  }

  // ── Drag handlers ─────────────────────────────────────
  function dragStarted(event, d) {
    if (currentLayout.value === 'force' && simulation) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
    }
    d.fx = d.x
    d.fy = d.y
  }

  function dragged(event, d) {
    d.fx = event.x
    d.fy = event.y
    if (currentLayout.value !== 'force') {
      d.x = event.x
      d.y = event.y
      ticked()
    }
  }

  function dragEnded(event, d) {
    if (currentLayout.value === 'force' && simulation) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }
    // Static layouts: node stays where dragged
  }

  // ── Layout switching ──────────────────────────────────
  function setLayout(layout) {
    currentLayout.value = layout
    if (simulation) { simulation.stop(); simulation = null }

    if (layout === 'force') {
      for (const n of nodes) { n.fx = null; n.fy = null }
      runForceLayout()
    } else {
      applyStaticLayout(layout)
      animateToPositions()
    }
  }

  function applyStaticLayout(layout) {
    switch (layout) {
      case 'circular': layoutCircular(); break
      case 'grid': layoutGrid(); break
      case 'concentric': layoutConcentric(); break
    }
  }

  function layoutCircular() {
    const cx = width / 2, cy = height / 2
    const r = Math.min(width, height) * 0.38
    const sorted = [...nodes].sort((a, b) => a.type.localeCompare(b.type))
    const indexMap = new Map(sorted.map((n, i) => [n.id, i]))
    for (const n of nodes) {
      const i = indexMap.get(n.id)
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
      n.x = cx + r * Math.cos(angle)
      n.y = cy + r * Math.sin(angle)
      n.fx = n.x; n.fy = n.y
    }
  }

  function layoutGrid() {
    const cols = Math.ceil(Math.sqrt(nodes.length))
    const rows = Math.ceil(nodes.length / cols)
    const cellW = width / (cols + 1)
    const cellH = height / (rows + 1)
    const sorted = [...nodes].sort((a, b) => a.type.localeCompare(b.type))
    const indexMap = new Map(sorted.map((n, i) => [n.id, i]))
    for (const n of nodes) {
      const i = indexMap.get(n.id)
      n.x = (i % cols + 1) * cellW
      n.y = (Math.floor(i / cols) + 1) * cellH
      n.fx = n.x; n.fy = n.y
    }
  }

  function layoutConcentric() {
    const cx = width / 2, cy = height / 2
    const sorted = [...nodes].sort((a, b) => b.degree - a.degree)
    if (sorted.length === 0) return

    // Group into rings by degree
    const rings = [[]]
    let curDeg = sorted[0].degree
    for (const n of sorted) {
      if (n.degree < curDeg && rings[rings.length - 1].length > 0) {
        rings.push([])
        curDeg = n.degree
      }
      rings[rings.length - 1].push(n)
    }
    if (rings.length === 1 && rings[0].length > 1) {
      const all = rings[0]
      rings[0] = [all[0]]
      rings.push(all.slice(1))
    }

    const maxR = Math.min(width, height) * 0.38
    const ringGap = rings.length > 1 ? maxR / rings.length : maxR
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri]
      const r = ri === 0 && ring.length === 1 ? 0 : ringGap * (ri + 0.5)
      for (let i = 0; i < ring.length; i++) {
        const n = ring[i]
        const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2
        n.x = cx + r * Math.cos(angle)
        n.y = cy + r * Math.sin(angle)
        n.fx = n.x; n.fy = n.y
      }
    }
  }

  function animateToPositions() {
    const g = d3.select(gEl)
    const t = g.transition().duration(600).ease(d3.easeCubicInOut)
    g.selectAll('g.graph-node')
      .transition(t)
      .attr('transform', d => `translate(${d.x},${d.y})`)
    g.selectAll('g.graph-edge line')
      .transition(t)
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    g.selectAll('g.graph-edge text')
      .transition(t)
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2 - 4)
  }

  // ── Zoom controls ─────────────────────────────────────
  function zoomIn() {
    if (!svgEl || !zoomBehavior) return
    d3.select(svgEl).transition().duration(300).call(zoomBehavior.scaleBy, 1.3)
  }
  function zoomOut() {
    if (!svgEl || !zoomBehavior) return
    d3.select(svgEl).transition().duration(300).call(zoomBehavior.scaleBy, 0.7)
  }
  function resetZoom() {
    if (!svgEl || !zoomBehavior) return
    d3.select(svgEl).transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity)
  }
  function fitToView() {
    if (!svgEl || !zoomBehavior || nodes.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.radius)
      minY = Math.min(minY, n.y - n.radius)
      maxX = Math.max(maxX, n.x + n.radius)
      maxY = Math.max(maxY, n.y + n.radius)
    }
    const pad = 50
    const gw = maxX - minX + pad * 2
    const gh = maxY - minY + pad * 2
    const scale = Math.min(width / gw, height / gh, 2)
    const tx = (width - (minX + maxX) * scale) / 2
    const ty = (height - (minY + maxY) * scale) / 2
    d3.select(svgEl).transition().duration(500)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }

  // ── Highlights ────────────────────────────────────────
  function updateHighlights() {
    if (!gEl) return
    for (const n of nodes) {
      n.highlighted = graphStore.highlightedNodes.has(n.id)
    }
    const g = d3.select(gEl)
    g.selectAll('g.graph-node .node-circle')
      .classed('highlighted', d => d.highlighted)
    g.selectAll('g.graph-edge line')
      .classed('highlighted', d => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target
        return graphStore.highlightedNodes.has(srcId) && graphStore.highlightedNodes.has(tgtId)
      })
  }

  function destroy() {
    if (simulation) { simulation.stop(); simulation = null }
  }

  onUnmounted(destroy)

  return {
    hoveredNode, tooltipX, tooltipY, currentLayout,
    init, update, updateHighlights, setLayout, destroy,
    zoomIn, zoomOut, resetZoom, fitToView
  }
}
