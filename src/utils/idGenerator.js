let counter = 0

export function generateId(prefix = 'n') {
  counter++
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function generateEdgeId(source, target, label) {
  return `e_${source}_${target}_${(label || '').replace(/\s+/g, '_')}`
}
