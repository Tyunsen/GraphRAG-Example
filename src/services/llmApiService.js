/**
 * LLM API Client - OpenAI compatible
 */

function resolveEndpoint(apiEndpoint) {
  let url = apiEndpoint.trim().replace(/\/+$/, '')
  if (!url) return url
  if (url.endsWith('/chat/completions')) return url
  if (url.startsWith('/api/llm')) return `${url}/chat/completions`
  if (!url.endsWith('/v1')) {
    url += '/v1'
  }
  return `${url}/chat/completions`
}

function inferModel(apiEndpoint) {
  const host = apiEndpoint.toLowerCase()
  if (host.includes('deepseek')) return 'deepseek-chat'
  if (host.includes('moonshot') || host.includes('kimi')) return 'moonshot-v1-8k'
  if (host.includes('dashscope') || host.includes('aliyun')) return 'qwen-turbo'
  if (host.includes('zhipuai') || host.includes('bigmodel')) return 'glm-4-flash'
  if (host.includes('baichuan')) return 'Baichuan2-Turbo'
  if (host.includes('minimax')) return 'MiniMax-M2.5'
  if (host.startsWith('/api/llm')) return 'MiniMax-M2.5'
  if (host.includes('openai')) return 'gpt-3.5-turbo'
  return 'gpt-3.5-turbo'
}

function stripReasoning(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}

export function sanitizeRAGAnswer(text) {
  return String(text || '')
    .replace(/\n{1,}(?:\*\*)?\s*证据来源\s*(?:：|:)?(?:\*\*)?[\s\S]*$/u, '')
    .trim()
}

export async function callLLM(settings, messages) {
  const { apiEndpoint, apiKey, modelName, temperature, maxTokens } = settings

  if (!apiEndpoint) throw new Error('API 端点未配置，请先在 API 设置中填写地址')

  const url = resolveEndpoint(apiEndpoint)
  const model = modelName || inferModel(apiEndpoint)

  const headers = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const body = {
    model,
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
  } catch (error) {
    throw new Error(`无法连接到 API (${url}): ${error.message}`)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 401) {
      throw new Error('API Key 无效或未配置 (401 Unauthorized)')
    }
    if (response.status === 404) {
      throw new Error(`API 端点不存在 (404)，请检查地址是否正确。当前请求: ${url}`)
    }
    throw new Error(`API 请求失败 (${response.status}): ${errorText || '未知错误'}`)
  }

  const data = await response.json()
  if (data.choices && data.choices.length > 0) {
    return stripReasoning(data.choices[0].message?.content || '')
  }

  if (data.response) return stripReasoning(data.response)
  if (data.result) return stripReasoning(data.result)
  if (data.output?.text) return stripReasoning(data.output.text)

  throw new Error('API 返回格式异常: 未找到有效回复内容')
}

export function buildRAGMessages(contextText, userQuery) {
  return [
    {
      role: 'system',
      content: `你是一个证据优先的工作区问答助手。请根据提供的证据段落做精简回答。
回答规则：
1. 直接回答用户问题，控制在 1 到 3 句话。
2. 不要在回答里重复列“证据来源”、文档名、第几段、涉及实体或涉及事件。
3. 只依据给出的证据段落和图谱辅助线索回答，不要编造。
4. 如果证据不足，直接说明“现有证据不足以回答”。
${contextText}`
    },
    {
      role: 'user',
      content: userQuery
    }
  ]
}
