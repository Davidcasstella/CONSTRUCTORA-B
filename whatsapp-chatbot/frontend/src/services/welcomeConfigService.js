// Welcome config service — CRUD for welcome, consent, closure messages
import { apiGet, apiPut } from './api';

/**
 * Get the full welcome configuration
 */
export async function getWelcomeConfig() {
  return apiGet('/api/welcome-config');
}

/**
 * Save the full welcome configuration
 */
export async function saveWelcomeConfig(config) {
  return apiPut('/api/welcome-config', config);
}
