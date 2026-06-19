// Document service — Knowledge base management
// Corrected endpoints based on actual backend routes

import { apiGet, apiPost, apiPostForm, apiDelete, apiPut, apiFetch } from './api';

// Documents
export async function getDocuments(stageId) {
  const endpoint = stageId ? `/api/knowledge/files/stage/${stageId}` : '/api/knowledge/files';
  return apiGet(endpoint);
}

export async function getDocumentContent(fileId) {
  return apiGet(`/api/knowledge/content/${fileId}`);
}

export async function deleteDocument(fileId) {
  return apiDelete(`/api/knowledge/files/${fileId}`);
}

export async function uploadDocument(formData) {
  return apiPostForm('/api/knowledge/upload', formData);
}

export async function saveManualDocument(data) {
  return apiPost('/api/knowledge/manual', data);
}

export async function updateManualDocument(docId, data) {
  return apiPut(`/api/knowledge/manual/${docId}`, data);
}

export async function reloadKnowledge() {
  return apiPost('/api/knowledge/reload', {});
}

// Stages: backend uses /api/stages (NOT /api/knowledge/stages)
export async function getStages() {
  return apiGet('/api/stages');
}

export async function createStage(data) {
  return apiPost('/api/stages', data);
}

export async function updateStage(stageId, data) {
  return apiPut(`/api/stages/${stageId}`, data);
}

export async function toggleStage(stageId, isActive) {
  const res = await apiFetch(`/api/stages/${stageId}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res) return null;
  return res.json();
}

export async function deleteStage(stageId) {
  return apiDelete(`/api/stages/${stageId}`);
}

// ✅ NUEVO: Toggle individual de documento
export async function toggleDocument(fileId, isActive) {
  const res = await apiFetch(`/api/knowledge/files/${fileId}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res) return null;
  return res.json();
}

// Download document with authentication
export async function downloadDocument(fileId, fileName) {
  const res = await apiFetch(`/api/knowledge/download/${fileId}`);
  if (!res || !res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'documento';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
}
