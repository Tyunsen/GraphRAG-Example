import Papa from 'papaparse'

/**
 * CSV Parser
 * Detects column patterns:
 * - subject/predicate/object → triples
 * - source/target → edge list
 * - Otherwise → entity list (first column = label, others = properties)
 */
export function parseCSV(text) {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  })

  if (!result.data || result.data.length === 0) {
    return { nodes: [], edges: [] }
  }

  const columns = result.meta.fields.map(f => f.toLowerCase().trim())

  // Triple format
  if (hasColumns(columns, ['subject', 'predicate', 'object']) ||
      hasColumns(columns, ['head', 'relation', 'tail'])) {
    return parseTripleCSV(result.data, result.meta.fields)
  }

  // Edge list format
  if (hasColumns(columns, ['source', 'target']) ||
      hasColumns(columns, ['from', 'to'])) {
    return parseEdgeCSV(result.data, result.meta.fields)
  }

  // Entity list format
  return parseEntityCSV(result.data, result.meta.fields)
}

function hasColumns(columns, required) {
  return required.every(r => columns.includes(r))
}

function findField(fields, ...candidates) {
  for (const c of candidates) {
    const found = fields.find(f => f.toLowerCase().trim() === c)
    if (found) return found
  }
  return null
}

function parseTripleCSV(rows, fields) {
  const subjField = findField(fields, 'subject', 'head', 'source')
  const predField = findField(fields, 'predicate', 'relation', 'label', 'type')
  const objField = findField(fields, 'object', 'tail', 'target')
  const subjTypeField = findField(fields, 'subject_type', 'head_type', 'source_type')
  const objTypeField = findField(fields, 'object_type', 'tail_type', 'target_type')

  const nodeSet = new Map()
  const edges = []

  for (const row of rows) {
    const subj = String(row[subjField] || '').trim()
    const pred = String(row[predField] || '').trim()
    const obj = String(row[objField] || '').trim()

    if (!subj || !obj) continue

    if (!nodeSet.has(subj)) {
      nodeSet.set(subj, {
        label: subj,
        type: (subjTypeField && row[subjTypeField]) ? String(row[subjTypeField]) : 'entity'
      })
    }
    if (!nodeSet.has(obj)) {
      nodeSet.set(obj, {
        label: obj,
        type: (objTypeField && row[objTypeField]) ? String(row[objTypeField]) : 'entity'
      })
    }
    edges.push({ source: subj, target: obj, label: pred })
  }

  return { nodes: Array.from(nodeSet.values()), edges }
}

function parseEdgeCSV(rows, fields) {
  const srcField = findField(fields, 'source', 'from')
  const tgtField = findField(fields, 'target', 'to')
  const labelField = findField(fields, 'label', 'relation', 'type', 'predicate')
  const weightField = findField(fields, 'weight')

  const nodeSet = new Map()
  const edges = []

  for (const row of rows) {
    const src = String(row[srcField] || '').trim()
    const tgt = String(row[tgtField] || '').trim()
    if (!src || !tgt) continue

    if (!nodeSet.has(src)) nodeSet.set(src, { label: src, type: 'entity' })
    if (!nodeSet.has(tgt)) nodeSet.set(tgt, { label: tgt, type: 'entity' })

    edges.push({
      source: src,
      target: tgt,
      label: labelField ? String(row[labelField] || '') : '',
      weight: weightField ? (row[weightField] || 1) : 1
    })
  }

  return { nodes: Array.from(nodeSet.values()), edges }
}

function parseEntityCSV(rows, fields) {
  const labelField = findField(fields, 'label', 'name', 'entity', 'title') || fields[0]
  const typeField = findField(fields, 'type', 'category', 'group', 'class')

  const nodes = []
  for (const row of rows) {
    const label = String(row[labelField] || '').trim()
    if (!label) continue

    const properties = {}
    for (const f of fields) {
      if (f !== labelField && f !== typeField && row[f] != null) {
        properties[f] = row[f]
      }
    }

    nodes.push({
      label,
      type: typeField ? String(row[typeField] || 'entity') : 'entity',
      properties
    })
  }

  return { nodes, edges: [] }
}
