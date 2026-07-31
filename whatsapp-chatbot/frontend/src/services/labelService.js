// Label catalog service — consume /api/labels/*

import { apiGet, apiPost, apiPut, apiDelete } from './api';

// Get all labels
export async function getLabels() {
  return apiGet('/api/labels');
}

// Create a label { name, color }
export async function createLabel(name, color) {
  return apiPost('/api/labels', { name, color });
}

// Update a label
export async function updateLabel(id, name, color) {
  return apiPut(`/api/labels/${id}`, { name, color });
}

// Delete a label
export async function deleteLabel(id) {
  return apiDelete(`/api/labels/${id}`);
}
