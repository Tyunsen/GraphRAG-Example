const ENTITY_RULES = [
  { keywords: ['国家', '政府', '外交', '制裁'], type: '国家' },
  { keywords: ['人物', '领导人', '总统', '总理', '指挥官', '最高领袖'], type: '人物' },
  { keywords: ['组织', '武装', '军队', '机构', '媒体'], type: '组织' },
  { keywords: ['设施', '基地', '港口', '机场', '核设施', '海峡'], type: '设施' },
  { keywords: ['地点', '城市', '地区', '海湾', '中东'], type: '地点' },
  { keywords: ['油价', '经济', '能源', '航运', '通胀', '贸易'], type: '经济指标' },
  { keywords: ['协议', '谈判', '声明', '政策'], type: '概念' }
]

const EVENT_RULES = [
  { keywords: ['空袭', '轰炸', '打击', '袭击'], type: '军事打击' },
  { keywords: ['导弹', '发射', '拦截'], type: '导弹行动' },
  { keywords: ['谈判', '停火', '会谈'], type: '外交谈判' },
  { keywords: ['制裁', '施压'], type: '制裁施压' },
  { keywords: ['封锁', '航运', '海峡'], type: '航运风险' },
  { keywords: ['油价', '物价', '经济', '市场'], type: '经济波动' },
  { keywords: ['领导', '继任', '政权'], type: '政治变动' }
]

const DEFAULT_RELATIONS = [
  '别名',
  '隶属',
  '位于',
  '支持',
  '对抗',
  '领导',
  '拥有',
  '控制',
  '发起',
  '执行',
  '参与',
  '针对',
  '受影响',
  '发生于',
  '宣布',
  '造成',
  '导致',
  '触发',
  '升级',
  '回应',
  '并行',
  '停火',
  '终止',
  '佐证',
  '矛盾'
]

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectTypes(source, rules, fallback = []) {
  const matched = []
  for (const rule of rules) {
    if (rule.keywords.some(keyword => source.includes(keyword))) {
      matched.push(rule.type)
    }
  }
  return dedupe(matched.length > 0 ? matched : fallback)
}

export function buildIntentProfile(intentQuery = '', intentSummary = '') {
  const source = normalizeText(`${intentQuery} ${intentSummary}`)
  const focusTopics = dedupe(
    source
      .split(/[，。；、,\s]+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
  ).slice(0, 12)

  const entityTypes = collectTypes(source, ENTITY_RULES, ['人物', '组织', '地点', '设施', '国家', '概念'])
  const eventTypes = collectTypes(source, EVENT_RULES, ['军事打击', '外交谈判', '经济波动'])

  return {
    focusTopics,
    entityTypes,
    eventTypes,
    allowedRelations: DEFAULT_RELATIONS,
    ignoreRules: ['共现噪音', '碎片词', '重复短语', '无证据支撑节点'],
    extractionMode: eventTypes.length > 0 ? 'event-centric' : 'entity-centric',
    qaStyle: 'evidence-first',
    generatedAt: Date.now()
  }
}
