const BASE = '/api'

async function request(path, options = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchGraphList() {
  return request('/workspaces')
}

export async function createWorkspaceApi(payload) {
  return request('/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function fetchGraph(graphId) {
  return request(`/workspaces/${graphId}`)
}

export async function fetchWorkspaceContext(graphId, payload) {
  return request(`/workspaces/${graphId}/context`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function saveGraph(graphId, data) {
  return request(`/workspaces/${graphId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function renameGraphApi(graphId, payload) {
  return request(`/workspaces/${graphId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export async function deleteGraphApi(graphId) {
  return request(`/workspaces/${graphId}`, {
    method: 'DELETE'
  })
}

export async function removeImportApi(graphId, importId) {
  return request(`/workspaces/${graphId}/imports/${importId}`, {
    method: 'DELETE'
  })
}

export async function fetchSessions(graphId) {
  return request(`/sessions/${graphId}`)
}

export async function createSessionApi(graphId, payload) {
  return request(`/sessions/${graphId}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function renameSessionApi(sessionId, title) {
  return request(`/sessions/detail/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  })
}

export async function deleteSessionApi(sessionId) {
  return request(`/sessions/detail/${sessionId}`, {
    method: 'DELETE'
  })
}

export async function fetchMessages(sessionId) {
  return request(`/messages/session/${sessionId}`)
}

export async function postMessage(sessionId, message) {
  return request(`/messages/session/${sessionId}`, {
    method: 'POST',
    body: JSON.stringify(message)
  })
}

export async function clearMessagesApi(sessionId) {
  return request(`/messages/session/${sessionId}`, {
    method: 'DELETE'
  })
}

export async function fetchFiles(graphId) {
  return request(`/files/${graphId}`)
}

export async function fetchFileDetail(fileId) {
  return request(`/files/detail/${fileId}`)
}

export async function saveFileContent(graphId, fileData) {
  return request(`/files/${graphId}`, {
    method: 'POST',
    body: JSON.stringify(fileData)
  })
}

export async function deleteFileApi(fileId) {
  return request(`/files/detail/${fileId}`, {
    method: 'DELETE'
  })
}

export async function searchFiles(graphId, keywords) {
  return request(`/files/${graphId}/search`, {
    method: 'POST',
    body: JSON.stringify({ keywords })
  })
}
