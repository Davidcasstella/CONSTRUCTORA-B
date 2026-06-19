// AI Rules service — CRUD for AI behavior rules
// Backend uses /api/ai-rules

import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from './api';

// Get all rules (active + inactive)
export async function getRules() {
  return apiGet('/api/ai-rules');
}

// Create a new rule
export async function createRule(data) {
  return apiPost('/api/ai-rules', data);
}

// Update an existing rule
export async function updateRule(id, data) {
  return apiPut(`/api/ai-rules/${id}`, data);
}

// Delete a rule
export async function deleteRule(id) {
  return apiDelete(`/api/ai-rules/${id}`);
}

// Toggle active state
export async function toggleRule(id, active) {
  const res = await apiFetch(`/api/ai-rules/${id}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
  if (!res) return null;
  return res.json();
}
