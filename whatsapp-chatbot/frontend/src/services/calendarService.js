import { apiGet, apiPost, apiDelete } from './api';

export async function getCalendarConfig() {
  return apiGet('/api/calendar/config');
}

export async function updateCalendarConfig(calendarId) {
  return apiPost('/api/calendar/config', { calendarId });
}

export async function getCalendarEvents(start, end) {
  return apiGet(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
}

export async function deleteCalendarEvent(eventId) {
  return apiDelete(`/api/calendar/events/${eventId}`);
}
