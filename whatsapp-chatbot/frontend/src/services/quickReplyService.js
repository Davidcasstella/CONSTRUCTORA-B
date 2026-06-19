// Quick reply service — Corrected endpoints
// Backend uses /api/quick-replies

import { apiGet, apiPost, apiPut, apiDelete } from './api';

// Active-only quick replies (for slash dropdown in chat)
export async function getActiveQuickReplies() {
  return apiGet('/api/quick-replies');
}

// All quick replies including inactive (for CRUD management page)
export async function getQuickReplies() {
  return apiGet('/api/quick-replies/all');
}

export async function createQuickReply(data) {
  return apiPost('/api/quick-replies', data);
}

export async function updateQuickReply(id, data) {
  return apiPut(`/api/quick-replies/${id}`, data);
}

export async function deleteQuickReply(id) {
  return apiDelete(`/api/quick-replies/${id}`);
}
