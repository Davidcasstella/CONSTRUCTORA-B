/**
 * Bulk Messaging API Service
 * All calls to /api/bulk/* endpoints
 */
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from './api';

// ===========================================
// FILE UPLOAD
// ===========================================

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await apiFetch('/api/bulk/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res) return null;
  return res.json();
}

// ===========================================
// MANUAL NUMBERS
// ===========================================

export async function createManualList(numbers, name) {
  return apiPost('/api/bulk/manual', { numbers, name });
}

// ===========================================
// CONTACT LISTS
// ===========================================

export async function getLists() {
  return apiGet('/api/bulk/lists');
}

export async function getListContacts(listId) {
  return apiGet(`/api/bulk/lists/${listId}/contacts`);
}

export async function deleteList(listId) {
  return apiDelete(`/api/bulk/lists/${listId}`);
}

export async function renameList(listId, name) {
  return apiPut(`/api/bulk/lists/${listId}`, { name });
}

// ===========================================
// MESSAGE PREVIEW
// ===========================================

export async function getPreview(messageTemplate, listIds, contacts) {
  return apiPost('/api/bulk/preview', { messageTemplate, listIds, contacts });
}

// ===========================================
// SEND
// ===========================================

export async function startSend(params) {
  return apiPost('/api/bulk/send', params);
}

// ===========================================
// CAMPAIGNS
// ===========================================

export async function getCampaigns() {
  return apiGet('/api/bulk/campaigns');
}

export async function getCampaignDetail(campaignId) {
  return apiGet(`/api/bulk/campaigns/${campaignId}`);
}

export async function getCampaignStatus(campaignId) {
  return apiGet(`/api/bulk/campaigns/${campaignId}/status`);
}

export async function pauseCampaign(campaignId) {
  return apiPost(`/api/bulk/campaigns/${campaignId}/pause`);
}

export async function resumeCampaign(campaignId) {
  return apiPost(`/api/bulk/campaigns/${campaignId}/resume`);
}

export async function cancelCampaign(campaignId) {
  return apiPost(`/api/bulk/campaigns/${campaignId}/cancel`);
}

// ===========================================
// ALL CONTACTS (Unified view)
// ===========================================

export async function getAllContacts({ page = 1, limit = 50, search = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  return apiGet(`/api/bulk/contacts/all?${params.toString()}`);
}

export async function addContact(name, phone) {
  return apiPost('/api/bulk/contacts/add', { name, phone });
}

// ===========================================
// CAMPAIGN DRAFTS
// ===========================================

export async function saveDraft(data) {
  return apiPost('/api/bulk/campaigns/draft', data);
}

// ===========================================
// MESSAGE TEMPLATES
// ===========================================

export async function getTemplates() {
  return apiGet('/api/bulk/templates');
}

export async function createTemplate(data) {
  return apiPost('/api/bulk/templates', data);
}

export async function updateTemplate(templateId, data) {
  return apiPut(`/api/bulk/templates/${templateId}`, data);
}

export async function deleteTemplate(templateId) {
  return apiDelete(`/api/bulk/templates/${templateId}`);
}

