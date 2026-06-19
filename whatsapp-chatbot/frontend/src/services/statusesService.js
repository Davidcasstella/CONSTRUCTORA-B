// Frontend service for the "Estados" (Statuses) module
import { apiGet, apiDelete, apiFetch } from './api.js';

/** Get all active statuses (non-expired) */
export async function getStatuses() {
  return apiGet('/api/statuses');
}

/**
 * Create a text status
 * @param {{ content: string, color: string, textColor: string }} data
 */
export async function createTextStatus(data) {
  const res = await apiFetch('/api/statuses/text', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res?.json();
}

/**
 * Create an image status
 * @param {FormData} formData  - must include 'image' file and optional 'caption'
 */
export async function createImageStatus(formData) {
  const res = await apiFetch('/api/statuses/image', {
    method: 'POST',
    body: formData,
  });
  return res?.json();
}

/**
 * Create a video status
 * @param {FormData} formData  - must include 'video' file and optional 'caption'
 */
export async function createVideoStatus(formData) {
  const res = await apiFetch('/api/statuses/video', {
    method: 'POST',
    body: formData,
  });
  return res?.json();
}

/**
 * Delete a status by ID
 * @param {string} id
 */
export async function deleteStatus(id) {
  return apiDelete(`/api/statuses/${id}`);
}

/**
 * Publish an existing dashboard status to WhatsApp (status@broadcast)
 * @param {string} id  - The status ID to publish
 */
export async function publishToWhatsApp(id) {
  const res = await apiFetch('/api/statuses/publish-to-whatsapp', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  return res?.json();
}
