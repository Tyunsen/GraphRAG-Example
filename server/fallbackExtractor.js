const EVENT_NODE_TYPE = '事件'

const COUNTRY_TERMS = [
  '以色列',
  '伊朗',
  '美国',
  '英国',
  '法国',
  '俄罗斯',
  '乌克兰',
  '叙利亚',
  '黎巴嫩',
  '伊拉克',
  '也门',
  '沙特',
  '卡塔尔',
  '约旦'
]

const ORGANIZATION_TERMS = [
  '伊斯兰革命卫队',
  '革命卫队',
  '以军',
  '美军',
  '联合国',
  '国际原子能机构',
  '真主党',
  '胡塞武装',
  '内塔尼亚胡政府'
]

const LOCATION_SUFFIXES = ['海峡', '港口', '机场', '基地', '城市']
const FACILITY_SUFFIXES = ['核设施', '油田', '炼油厂', '核电站', '指挥部', '军事基地']
const ORG_SUFFIXES = ['政府', '当局', '军方', '军', '部队', '卫队', '组织', '机构']

const EVENT_PATTERNS = [
  { keyword: '空袭', role: 'attack', eventType: '军事打击' },
  { keyword: '袭击', role: 'attack', eventType: '军事打击' },
  { keyword: '打击', role: 'attack', eventType: '军事打击' },
  { keyword: '报复', role: 'response', eventType: '回应行动' },
  { keyword: '升级', role: 'escalate', eventType: '局势升级' },
  { keyword: '宣布', role: 'announce', eventType: '声明发布' },
  { keyword: '威胁', role: 'threaten', eventType: '威胁表态' },
  { keyword: '封锁', role: 'blockade', eventType: '封锁威胁' },
  { keyword: '制裁', role: 'sanction', eventType: '制裁施压' },
  { keyword: '谈判', role: 'negotiate', eventType: '外交谈判' },
  { keyword: '停火', role: 'ceasefire', eventType: '停火行动' }
]

function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function clean(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function splitSentences(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/[。！？!\?\n]+/g)
    .map(item => clean(item))
    .filter(Boolean)
}

function addNode(nodeMap, label, type = '概念', properties = {}) {
  const normalized = clean(label)
  if (!normalized || normalized.length < 2) return
  const key = normalized.toLowerCase()
  const existing = nodeMap.get(key)
  if (existing) {
    existing.properties = { ...(existing.properties || {}), ...properties }
    return
  }
  nodeMap.set(key, { label: normalized, type, properties })
}

function addEdge(edgeMap, source, target, label) {
  const head = clean(source)
  const tail = clean(target)
  const relation = clean(label)
  if (!head || !tail || !relation || head === tail) return
  const key = `${head}|||${relation}|||${tail}`
  if (!edgeMap.has(key)) {
    edgeMap.set(key, { source: head, target: tail, label: relation, properties: {} })
  }
}

function collectSuffixMatches(text, suffixes, type) {
  const matches = []
  for (const suffix of suffixes) {
    const pattern = new RegExp(`[\\u4e00-\\u9fa5A-Za-z0-9·]{2,20}${suffix}`, 'g')
    for (const found of text.match(pattern) || []) {
      matches.push({ label: clean(found), type })
    }
  }
  return matches
}

function extractEntities(sentence) {
  const matches = []

  for (const term of COUNTRY_TERMS) {
    if (sentence.includes(term)) matches.push({ label: term, type: '国家' })
  }

  for (const term of ORGANIZATION_TERMS) {
    if (sentence.includes(term)) matches.push({ label: term, type: '组织' })
  }

  matches.push(...collectSuffixMatches(sentence, LOCATION_SUFFIXES, '地点'))
  matches.push(...collectSuffixMatches(sentence, FACILITY_SUFFIXES, '设施'))
  matches.push(...collectSuffixMatches(sentence, ORG_SUFFIXES, '组织'))

  return unique(matches.map(item => `${item.label}|||${item.type}`)).map(item => {
    const [label, type] = item.split('|||')
    return { label, type }
  })
}

function buildEventLabel(subject, keyword, object) {
  const parts = [subject, keyword, object].filter(Boolean)
  return clean(parts.join(''))
}

function pickRelationLabels(role) {
  switch (role) {
    case 'attack':
      return { actor: '发起', object: '针对' }
    case 'response':
      return { actor: '回应', object: '针对' }
    case 'announce':
      return { actor: '宣布', object: '针对' }
    case 'blockade':
      return { actor: '发起', object: '针对' }
    case 'sanction':
      return { actor: '发起', object: '针对' }
    case 'negotiate':
      return { actor: '参与', object: '针对' }
    case 'ceasefire':
      return { actor: '宣布', object: '针对' }
    case 'escalate':
      return { actor: '推动', object: '影响' }
    case 'threaten':
      return { actor: '宣布', object: '针对' }
    default:
      return { actor: '发起', object: '影响' }
  }
}

export function extractFallbackGraph(text = '') {
  const nodeMap = new Map()
  const edgeMap = new Map()
  const sentences = splitSentences(text)

  for (const sentence of sentences) {
    const entities = extractEntities(sentence)
    for (const entity of entities) {
      addNode(nodeMap, entity.label, entity.type)
    }

    const matchedEvent = EVENT_PATTERNS.find(item => sentence.includes(item.keyword))
    if (!matchedEvent) continue

    const actor = entities[0]?.label || ''
    const object = entities.find(item => item.label !== actor)?.label || ''
    const eventLabel = buildEventLabel(actor, matchedEvent.keyword, object)
      || clean(sentence.slice(0, 24))

    addNode(nodeMap, eventLabel, EVENT_NODE_TYPE, {
      eventType: matchedEvent.eventType,
      trigger: matchedEvent.keyword,
      subject: actor ? [actor] : [],
      object: object ? [object] : [],
      summary: sentence
    })

    const relationLabels = pickRelationLabels(matchedEvent.role)
    if (actor) addEdge(edgeMap, actor, eventLabel, relationLabels.actor)
    if (object) addEdge(edgeMap, eventLabel, object, relationLabels.object)

    if (entities.length >= 2 && actor && object && matchedEvent.role === 'attack') {
      addEdge(edgeMap, actor, object, '对抗')
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()]
  }
}
