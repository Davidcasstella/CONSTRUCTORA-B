// Settings service — CORRECTED endpoints

import { apiGet, apiPost, apiDelete, apiFetch } from './api';

// General settings
export async function getSettings() {
  return apiGet('/api/settings');
}

export async function saveSettings(settings) {
  return apiPost('/api/settings', settings);
}

// Test connection
export async function testConnection(settings) {
  return apiPost('/api/test-connection', settings);
}

// API Keys management (uses /api/keys/)
export async function getKeyStatus() {
  return apiGet('/api/keys/status');
}

export async function saveApiKey(provider, apiKey) {
  return apiPost(`/api/keys/${provider}`, { apiKey });
}

export async function deleteApiKey(provider) {
  return apiDelete(`/api/keys/${provider}`);
}

export async function deleteAllApiKeys() {
  const results = await Promise.all([
    apiDelete('/api/keys/groq'),
    apiDelete('/api/keys/openai'),
    apiDelete('/api/keys/aws'),
  ]);
  return results;
}

// AI provider settings
export async function getAIProviderSettings() {
  return apiGet('/api/ai-settings');
}

export async function updateAIProviderSettings(settings) {
  return apiPost('/api/ai-settings', settings);
}

// Session management
export async function logoutWhatsApp() {
  const res = await apiFetch('/logout', { method: 'POST' });
  if (!res) return null;
  return res.json();
}

export async function clearSession() {
  const res = await apiFetch('/clear-session', { method: 'POST' });
  if (!res) return null;
  return res.json();
}
