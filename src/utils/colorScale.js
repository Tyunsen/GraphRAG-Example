import * as d3 from 'd3'

const TYPE_COLORS = [
  '#4f6df5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#a855f7', '#e11d48', '#0891b2', '#ca8a04', '#059669'
]

const typeColorMap = new Map()
let colorIndex = 0

export function getColorForType(type) {
  const key = (type || 'default').toLowerCase()
  if (!typeColorMap.has(key)) {
    typeColorMap.set(key, TYPE_COLORS[colorIndex % TYPE_COLORS.length])
    colorIndex++
  }
  return typeColorMap.get(key)
}

export function getTypeColorMap() {
  return new Map(typeColorMap)
}

export function resetColors() {
  typeColorMap.clear()
  colorIndex = 0
}

export function getNodeRadius(degree) {
  return Math.max(6, Math.min(20, 6 + Math.sqrt(degree || 0) * 2))
}
