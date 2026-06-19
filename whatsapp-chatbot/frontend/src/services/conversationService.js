// Conversation service — Full API for WhatsApp Chat view
// Merges Baileys + Memory + DynamoDB data

import { apiGet, apiPost, apiPostForm, apiDelete } from './api';
import { apiFetch } from './api';

// Main conversations list: uses /api/conversations/whatsapp-chats
export async function getConversations(offset = 0, limit = 30, searchQuery = '') {
  let url = `/api/conversations/whatsapp-chats?offset=${offset}&limit=${limit}`;
  if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
  return apiGet(url);
}

// Stats (separate endpoint)
export async function getStats() {
  return apiGet('/api/conversations/stats');
}

// Messages for a specific conversation
export async function getMessages(userId, limit = 20, cursor = null) {
  let url = `/api/conversations/${encodeURIComponent(userId)}/whatsapp-messages?limit=${limit}`;
  if (cursor) url += `&cursor=${cursor}`;
  return apiGet(url);
}

// Send a text message from the advisor
export async function sendMessage(userId, message, advisor, replyTo = null) {
  const body = { message, advisor };
  if (replyTo) body.replyTo = replyTo;
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/send-message`, body);
}

// Upload media file
export async function uploadMedia(file, type, caption = '') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  if (caption) formData.append('caption', caption);
  return apiPostForm('/api/conversations/upload-media', formData);
}

// Send media to a conversation
export async function sendMedia(userId, media, caption, advisor) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/send-media`, {
    media, caption, advisor
  });
}

// Conversation actions
export async function takeConversation(userId, advisor) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/take`, { advisor });
}

export async function releaseConversation(userId) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/release`, {});
}

export async function resetConversation(userId) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/reset`, {});
}

// Bot control
export async function reactivateBot(userId, advisor) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/reactivate-bot`, { advisor });
}

export async function deactivateBot(userId, advisor) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/deactivate-bot`, {
    reason: 'manual_deactivation', advisor
  });
}

// Edit contact custom name
export async function editCustomName(userId, name) {
  return apiPost(`/api/conversations/${encodeURIComponent(userId)}/custom-name`, { name });
}

// Delete conversation
export async function deleteConversation(userId) {
  return apiDelete(`/api/conversations/${encodeURIComponent(userId)}`);
}

// Create new chat
export async function createChat(phoneNumber, name = '') {
  return apiPost('/api/conversations/create-chat', { phoneNumber, name });
}
