/**
 * Frontend API client for communicating with the Express/SQLite backend
 */

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

// ── Graphs ──────────────────────────────────────────────────

export async function fetchGraphList() {
  return request('/graphs')
}

export async function fetchGraph(graphId) {
  return request(`/graphs/${graphId}`)
}

export async function saveGraph(graphId, data) {
  return request(`/graphs/${graphId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function renameGraphApi(graphId, name) {
  return request(`/graphs/${graphId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  })
}

export async function deleteGraphApi(graphId) {
  return request(`/graphs/${graphId}`, {
    method: 'DELETE'
  })
}

export async function removeImportApi(graphId, importId) {
  return request(`/graphs/${graphId}/imports/${importId}`, {
    method: 'DELETE'
  })
}

// ── Messages ────────────────────────────────────────────────

export async function fetchMessages(graphId) {
  return request(`/messages/${graphId}`)
}

export async function postMessage(graphId, message) {
  return request(`/messages/${graphId}`, {
    method: 'POST',
    body: JSON.stringify(message)
  })
}

export async function clearMessagesApi(graphId) {
  return request(`/messages/${graphId}`, {
    method: 'DELETE'
  })
}

// ── Files ───────────────────────────────────────────────────

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
