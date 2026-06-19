// Number control service — matches backend API response formats

import { apiGet, apiPost, apiPut, apiDelete } from './api';

// ===========================
// NUMBER CONTROL
// ===========================

// Get all controlled numbers (IA disabled) + stats
export async function getNumberControlData() {
  return apiGet('/api/conversations/number-control');
}

// Get all conversations (for the "All Numbers" tab)
export async function getAllConversations() {
  return apiGet('/api/conversations?limit=200&offset=0');
}

// Disable IA for a phone number (add to controlled list)
export async function disableIA(phoneNumber, reason) {
  return apiPost('/api/conversations/number-control', {
    phoneNumber,
    reason,
    action: 'disable'
  });
}

// Enable IA for a phone number (update iaActive to true, keeps the record)
export async function enableIA(phoneNumber) {
  return apiPut(`/api/conversations/number-control/${encodeURIComponent(phoneNumber)}`, {
    iaActive: true,
    updatedBy: 'Asesor'
  });
}

// Add a number manually with IA disabled
export async function addNumber(phone, name, reason) {
  return apiPost('/api/conversations/number-control', {
    phoneNumber: phone,
    name,
    reason,
    action: 'add'
  });
}

// Update a controlled number's data
export async function updateNumber(phoneNumber, data) {
  return apiPut(`/api/conversations/number-control/${encodeURIComponent(phoneNumber)}`, data);
}

// Remove a number from control entirely
export async function removeNumber(phoneNumber) {
  return apiDelete(`/api/conversations/number-control/${encodeURIComponent(phoneNumber)}`);
}

// ===========================
// SPAM CONTROL
// ===========================

// Get all spam data (blocks + stats)
export async function getSpamData() {
  return apiGet('/api/conversations/spam-control');
}

// Get only active spam blocks
export async function getActiveSpam() {
  return apiGet('/api/conversations/spam-control/active');
}

// Unblock a number from spam (reactivate IA)
export async function unblockSpam(phoneNumber) {
  return apiPost(`/api/conversations/spam-control/${encodeURIComponent(phoneNumber)}/reactivate`, {});
}
