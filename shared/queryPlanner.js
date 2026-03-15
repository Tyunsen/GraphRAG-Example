const GENERIC_STOP_TERMS = new Set([
  '最近',
  '当前',
  '现在',
  '情况',
  '什么',
  '哪些',
  '哪个',
  '哪里',
  '如何',
  '为何',
  '为什么',
  '谁',
  '是',
  '了',
  '吗',
  '呢',
  '请问',
  '一下',
  '有关',
  '相关',
  '问题'
])

const TERM_ALIASES = {
  领导人: ['领导人', '领袖', '最高领袖', '领导层', '接班人', '掌权者', '首脑'],
  打击: ['打击', '空袭', '袭击', '轰炸', '攻击', '军事打击'],
  谈判: ['谈判', '会谈', '磋商', '停火谈判', '外交谈判'],
  影响: ['影响', '冲击', '后果', '外溢', '波及'],
  原因: ['原因', '为何', '为什么', '动因'],
  升级: ['升级', '恶化', '扩大', '加剧'],
  油价: ['油价', '能源价格', '国际油价'],
  航运: ['航运', '海运', '油轮', '霍尔木兹海峡'],
  伊朗: ['伊朗', '伊方', '德黑兰', '伊朗政府'],
  美国: ['美国', '美方', '白宫', '华盛顿'],
  以色列: ['以色列', '以方', '以军'],
  中国: ['中国', '中方', '中国政府', '中国外交部', '北京']
}

const QUERY_PATTERNS = [
  {
    type: 'fact.person',
    patterns: [/(谁).*?(领导人|领袖|最高领袖|总统|总理|负责人)/, /(领导人|领袖|最高领袖|总统|总理|负责人).*?(是谁|是谁啊|是谁呀)/],
    expectedNodeTypes: ['人物'],
    expectedEventTypes: ['政治变动', '声明发布'],
    relationHints: ['领导', '宣布', '继任']
  },
  {
    type: 'fact.time',
    patterns: [/(什么时候|何时|哪天|何年|时间)/],
    expectedNodeTypes: ['事件', '地点'],
    expectedEventTypes: ['军事打击', '外交谈判', '政治变动'],
    relationHints: ['发生于']
  },
  {
    type: 'fact.location',
    patterns: [/(哪里|在哪|哪些地方|什么地方|地点)/],
    expectedNodeTypes: ['地点', '设施', '事件'],
    expectedEventTypes: ['军事打击', '航运风险'],
    relationHints: ['发生于', '位于', '针对']
  },
  {
    type: 'reason.cause',
    patterns: [/(为什么|为何|原因)/],
    expectedNodeTypes: ['事件', '经济指标', '概念'],
    expectedEventTypes: ['军事打击', '航运风险', '经济波动'],
    relationHints: ['导致', '触发', '升级', '回应']
  },
  {
    type: 'impact.effect',
    patterns: [/(影响|后果|冲击|波及)/],
    expectedNodeTypes: ['事件', '经济指标', '概念'],
    expectedEventTypes: ['经济波动', '航运风险', '政治变动'],
    relationHints: ['影响', '造成', '导致']
  },
  {
    type: 'overview.recent',
    patterns: [/(最近|近期|当前|局势|发生了什么|进展|态势)/],
    expectedNodeTypes: ['事件'],
    expectedEventTypes: ['军事打击', '外交谈判', '经济波动', '政治变动'],
    relationHints: ['升级', '回应', '导致']
  }
]

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findCanonicalTerms(query = '') {
  const matches = []
  for (const [canonical, aliases] of Object.entries(TERM_ALIASES)) {
    if (aliases.some(alias => alias && query.includes(alias))) {
      matches.push(canonical)
    }
  }
  return dedupe(matches)
}

function splitLiteralTerms(query = '') {
  const cleaned = normalizeText(query)
    .replace(/[？?！!，,。；;：:]/g, ' ')
    .replace(/(是谁|是谁啊|是谁呀|为什么|为何|原因|最近|近期|当前|局势|发生了什么|发生什么|有哪些|哪里|在哪|什么时候|何时)/g, ' ')

  return dedupe(
    cleaned
      .split(/\s+/)
      .map(item => item.trim())
      .filter(item => item.length >= 2)
      .filter(item => !GENERIC_STOP_TERMS.has(item))
      .flatMap(item => {
        if (item.length <= 6) return [item]
        const parts = []
        for (const canonical of Object.keys(TERM_ALIASES)) {
          if (item.includes(canonical)) parts.push(canonical)
        }
        return parts.length > 0 ? [item, ...parts] : [item]
      })
  )
}

function detectQueryMode(query = '') {
  for (const rule of QUERY_PATTERNS) {
    if (rule.patterns.some(pattern => pattern.test(query))) {
      return rule
    }
  }

  return {
    type: 'fact.general',
    expectedNodeTypes: ['事件', '人物', '组织', '地点', '设施', '国家'],
    expectedEventTypes: ['军事打击', '外交谈判', '经济波动', '政治变动'],
    relationHints: ['针对', '导致', '回应']
  }
}

export function buildQueryPlan(query = '') {
  const normalizedQuery = normalizeText(query)
  const mode = detectQueryMode(normalizedQuery)
  const canonicalTerms = findCanonicalTerms(normalizedQuery)
  const literalTerms = splitLiteralTerms(normalizedQuery)

  const targetTerms = dedupe([...canonicalTerms, ...literalTerms]).slice(0, 8)
  const expandedTerms = dedupe(
    targetTerms.flatMap(term => TERM_ALIASES[term] || [term])
  ).slice(0, 18)

  return {
    rawQuery: query,
    normalizedQuery,
    queryType: mode.type,
    targetTerms,
    expandedTerms,
    relationHints: mode.relationHints || [],
    expectedNodeTypes: mode.expectedNodeTypes || [],
    expectedEventTypes: mode.expectedEventTypes || [],
    retrievalMode: mode.type.startsWith('overview') ? 'overview' : mode.type.startsWith('reason') || mode.type.startsWith('impact') ? 'path' : 'fact'
  }
}
