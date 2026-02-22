/**
 * LLM API Client - OpenAI compatible
 */

function resolveEndpoint(apiEndpoint) {
  let url = apiEndpoint.trim().replace(/\/+$/, '')
  if (!url.endsWith('/chat/completions')) {
    if (!url.endsWith('/v1')) {
      url += '/v1'
    }
    url += '/chat/completions'
  }
  return url
}

/** Infer default model name from the API endpoint URL */
function inferModel(apiEndpoint) {
  const host = apiEndpoint.toLowerCase()
  if (host.includes('deepseek')) return 'deepseek-chat'
  if (host.includes('moonshot') || host.includes('kimi')) return 'moonshot-v1-8k'
  if (host.includes('dashscope') || host.includes('aliyun')) return 'qwen-turbo'
  if (host.includes('zhipuai') || host.includes('bigmodel')) return 'glm-4-flash'
  if (host.includes('baichuan')) return 'Baichuan2-Turbo'
  if (host.includes('minimax')) return 'abab5.5-chat'
  if (host.includes('openai')) return 'gpt-3.5-turbo'
  return 'gpt-3.5-turbo'
}

export async function callLLM(settings, messages) {
  const { apiEndpoint, apiKey, modelName, temperature, maxTokens } = settings

  if (!apiEndpoint) throw new Error('API 端点未配置，请在 API 标签页中设置')

  const url = resolveEndpoint(apiEndpoint)
  const model = modelName || inferModel(apiEndpoint)

  const headers = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const body = {
    model: model,
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 1024,
    stream: false
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  } catch (e) {
    throw new Error(`无法连接到 API (${url}): ${e.message}`)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401) {
      throw new Error('API Key 无效或未设置 (401 Unauthorized)')
    }
    if (response.status === 404) {
      throw new Error(`API 端点不存在 (404)，请检查地址是否正确。当前请求: ${url}`)
    }
    throw new Error(`API 请求失败 (${response.status}): ${errorText || '未知错误'}`)
  }

  const data = await response.json()
  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message?.content || ''
  }

  // Some APIs return result in different formats
  if (data.response) return data.response
  if (data.result) return data.result
  if (data.output?.text) return data.output.text

  throw new Error('API 返回格式异常: 未找到有效回复内容')
}

/**
 * Build messages array for RAG query
 */
export function buildRAGMessages(contextText, userQuery) {
  return [
    {
      role: 'system',
      content: `你是一个智能文档问答助手。请根据提供的参考资料回答用户的问题。

回答规则：
1. 以"原始文档内容"为核心依据，优先引用文档中的原文进行回答
2. "知识图谱结构"仅作为辅助参考，帮助理解实体之间的关系
3. 回答应准确、详细，尽量基于文档原文，可以适当引用关键语句
4. 如果文档中没有相关信息，请诚实说明

${contextText}`
    },
    {
      role: 'user',
      content: userQuery
    }
  ]
}
