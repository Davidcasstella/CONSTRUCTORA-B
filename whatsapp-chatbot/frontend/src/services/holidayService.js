// Holiday service — CORRECTED endpoints

import { apiGet, apiPost, apiDelete, apiFetch } from './api';

// Holidays use separate route /api/holidays
export async function getHolidays(year) {
  return apiGet(`/api/holidays/by-year/${year}`);
}

export async function createHoliday(data) {
  return apiPost('/api/holidays', data);
}

export async function toggleHoliday(id, active) {
  const res = await apiFetch(`/api/holidays/${id}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function deleteHoliday(id) {
  return apiDelete(`/api/holidays/${id}`);
}

// Holiday check is under /api/conversations
export async function getHolidayConfig() {
  return apiGet('/api/conversations/holiday-check-status');
}

export async function setHolidayCheckEnabled(enabled) {
  return apiPost('/api/conversations/toggle-holiday-check', { enabled });
}

// Schedule check is under /api/conversations
export async function getScheduleConfig() {
  return apiGet('/api/conversations/schedule-check-status');
}

export async function getScheduleDetail() {
  return apiGet('/api/conversations/schedule-config');
}

export async function setScheduleCheckEnabled(enabled) {
  return apiPost('/api/conversations/toggle-schedule-check', { enabled });
}
