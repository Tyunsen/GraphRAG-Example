/**
 * Enhanced text parser — extracts entities & relations from plain text.
 * Also serves as the core extraction engine for MD / PDF parsers.
 */

// ── Relation patterns ─────────────────────────────────────
// Each: [regex(global), relLabel or null=use captured verb]
// Capture groups: (subject)(verb?)(object)

const CN_PATTERNS = [
  // A 是 B (的 C)
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*是\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*的\s*(?<a>[\u4e00-\u9fff\w]{1,8})/g, '_isXofY'],
  // A 是 B
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*是\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)(?=[,，。；！？\n)）]|$)/g, '是'],
  // A verb B — classification / belonging
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>属于|隶属于|归属于|归入)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // composition
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>包含|包括|涵盖|由|组成|分为|划分为)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // creation
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>创建了?|发明了?|提出了?|发现了?|开发了?|设计了?|创立了?|建立了?|编写了?|撰写了?|研发了?|推出了?)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // location / affiliation
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>位于|来自|出生于|毕业于|就职于|任职于|工作于|坐落于|诞生于|总部在|发源于)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // causation / influence
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>影响了?|导致了?|引发了?|促进了?|推动了?|支持|支撑|驱动了?)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // usage / dependency
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?<v>基于|依赖|使用|采用|应用于?|利用|用于|服务于|运行于?)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, null],
  // alias
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?:被称为|又称|也叫|也称|即|亦称|简称)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18})/g, '别名'],
  // A 和/与 B （同类关联）
  [/(?<s>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)\s*(?:和|与|及)\s*(?<o>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fff\w·\- ]{1,18}?)(?=\s*(?:都|均|一起|共同|是|属于|被))/g, '关联'],
]

const EN_PATTERNS = [
  [/(?<s>[A-Z][\w]+(?: [A-Z][\w]+)*)\s+(?:is|are|was|were)\s+(?:a |an |the )?(?<o>[A-Z][\w]+(?: [a-zA-Z][\w]+)*)/g, '是'],
  [/(?<s>[A-Z][\w]+(?: [A-Z][\w]+)*)\s+(?<v>discovered|invented|created|founded|developed|designed|wrote|built|leads?|manages?|supports?|uses?|contains?)\s+(?<o>[A-Z][\w]+(?: [A-Z][\w]+)*)/gi, null],
  [/(?<s>[A-Z][\w]+(?: [A-Z][\w]+)*)\s+(?:is |are )?(?<v>based on|part of|located in|belongs? to|works? (?:at|for)|known as)\s+(?<o>[A-Z][\w]+(?: [A-Z][\w]+)*)/gi, null],
]

// ── Stop words for co-occurrence filtering ─────────────
const STOP = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '这', '那', '什么', '可以', '能', '但是', '因为', '所以', '如果', '而', '或',
  '与', '及', '被', '把', '让', '给', '对', '从', '向', '用', '以', '其', '该',
  '这个', '那个', '这些', '那些', '之', '为', '中', '等', '种', '个', '些',
  '进行', '通过', '使用', '可能', '需要', '已经', '正在', '将', '将会', '还',
  '更', '最', '非常', '十分', '比较', '相当', '特别', '以及', '或者', '并且',
])

// ── Main entry ─────────────────────────────────────────
export function parseTXT(text) {
  return extractFromText(text)
}

/**
 * Core extraction engine.
 * @param {string} text          Plain text
 * @param {Array}  headings      Optional [{label,type,level}] from MD headings
 */
export function extractFromText(text, headings = []) {
  const nodeMap = new Map() // label → {label, type}
  const edgeSet = new Map() // "src||tgt||rel" → edge
  const add = (label, type) => addNode(nodeMap, label, type)
  const link = (s, t, rel) => addEdge(edgeSet, nodeMap, s, t, rel)

  // ① Register headings as entities + hierarchy
  for (const h of headings) add(h.label, h.type || '概念')
  for (let i = 1; i < headings.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (headings[j].level < headings[i].level) {
        link(headings[i].label, headings[j].label, '属于')
        break
      }
    }
  }

  // ② Extract entities from quoted / bracketed terms
  const quoted = text.match(/[《「『【][^》」』】\n]{2,20}[》」』】]|"[^"\n]{2,20}"|"[^"\n]{2,20}"/g) || []
  for (const q of quoted) add(q.slice(1, -1).trim(), '概念')

  // ③ Pattern-based relation extraction
  for (const [pat, fixedRel] of [...CN_PATTERNS, ...EN_PATTERNS]) {
    pat.lastIndex = 0
    let m
    while ((m = pat.exec(text)) !== null) {
      const { s, o, v, a } = m.groups || {}
      const subj = clean(s), obj = clean(o)
      if (!subj || !obj || subj === obj) continue

      if (fixedRel === '_isXofY' && a) {
        // "A 是 B 的 C" → edge(A, B, C)
        link(subj, obj, clean(a))
      } else {
        link(subj, obj, fixedRel || clean(v) || '关联')
      }
    }
  }

  // ④ Extract frequent Chinese key terms as entities
  extractFrequentTerms(text, nodeMap)

  // ⑤ Sentence-level co-occurrence (for entities that have few edges)
  buildCoOccurrence(text, nodeMap, edgeSet)

  // ⑥ Clean up short / invalid nodes
  for (const [k, n] of nodeMap) {
    if (n.label.length < 2 || /^[\d\s.,，。]+$/.test(n.label)) nodeMap.delete(k)
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeSet.values())
  }
}

// ── Helpers ────────────────────────────────────────────

function clean(s) {
  return (s || '').trim().replace(/^[,，。；：:!\s]+|[,，。；：:!\s]+$/g, '')
}

function addNode(nodeMap, label, type) {
  label = clean(label)
  if (!label || label.length < 2) return
  const key = label.toLowerCase()
  if (!nodeMap.has(key)) {
    nodeMap.set(key, { label, type: type || 'entity' })
  }
}

function addEdge(edgeSet, nodeMap, src, tgt, rel) {
  src = clean(src); tgt = clean(tgt); rel = clean(rel) || '关联'
  if (!src || !tgt || src.length < 2 || tgt.length < 2) return
  addNode(nodeMap, src, 'entity')
  addNode(nodeMap, tgt, 'entity')
  const key = `${src.toLowerCase()}||${tgt.toLowerCase()}||${rel}`
  if (!edgeSet.has(key)) {
    edgeSet.set(key, { source: src, target: tgt, label: rel })
  }
}

function extractFrequentTerms(text, nodeMap) {
  // Count Chinese 2-4 char terms
  const freq = new Map()
  const re = /[\u4e00-\u9fff]{2,6}/g
  let m
  while ((m = re.exec(text)) !== null) {
    const w = m[0]
    if (STOP.has(w)) continue
    // Try 2,3,4-grams from the match
    for (let len = Math.min(4, w.length); len >= 2; len--) {
      for (let i = 0; i <= w.length - len; i++) {
        const gram = w.substring(i, i + len)
        if (!STOP.has(gram)) {
          freq.set(gram, (freq.get(gram) || 0) + 1)
        }
      }
    }
  }

  // English proper nouns
  const enRe = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g
  while ((m = enRe.exec(text)) !== null) {
    const w = m[0]
    if (w.length >= 3) freq.set(w, (freq.get(w) || 0) + 1)
  }

  // Add terms that appear 2+ times and are not already nodes
  const threshold = 2
  for (const [term, count] of freq) {
    if (count >= threshold && !nodeMap.has(term.toLowerCase())) {
      addNode(nodeMap, term, 'entity')
    }
  }
}

function buildCoOccurrence(text, nodeMap, edgeSet) {
  // Split into sentences
  const sentences = text.split(/[。！？\.\!\?\n]+/).filter(s => s.trim().length > 4)
  const labels = Array.from(nodeMap.values()).map(n => n.label)

  for (const sent of sentences) {
    const found = labels.filter(l => sent.includes(l))
    // Limit co-occurrence edges to avoid explosion
    if (found.length >= 2 && found.length <= 8) {
      for (let i = 0; i < found.length; i++) {
        for (let j = i + 1; j < found.length; j++) {
          const key = `${found[i].toLowerCase()}||${found[j].toLowerCase()}||共现`
          if (!edgeSet.has(key)) {
            // Only add co-occurrence if no stronger relation already exists
            const revKey = `${found[j].toLowerCase()}||${found[i].toLowerCase()}||共现`
            const hasRelation = Array.from(edgeSet.keys()).some(k => {
              const parts = k.split('||')
              return (parts[0] === found[i].toLowerCase() && parts[1] === found[j].toLowerCase()) ||
                     (parts[0] === found[j].toLowerCase() && parts[1] === found[i].toLowerCase())
            })
            if (!hasRelation) {
              addEdge(edgeSet, nodeMap, found[i], found[j], '共现')
            }
          }
        }
      }
    }
  }
}
