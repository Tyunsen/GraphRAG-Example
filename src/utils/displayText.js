const TYPE_LABELS = {
  default: '未分类',
  entity: '实体',
  event: '事件',
  person: '人物',
  people: '人物',
  organization: '组织',
  org: '组织',
  location: '地点',
  place: '地点',
  facility: '设施',
  country: '国家',
  concept: '概念'
}

export function formatNodeTypeLabel(type) {
  const text = String(type || '').trim()
  if (!text) return TYPE_LABELS.default

  const key = text.toLowerCase()
  if (TYPE_LABELS[key]) return TYPE_LABELS[key]

  return text
}
