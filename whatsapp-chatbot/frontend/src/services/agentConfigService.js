// Agent personalization config service

import { apiGet, apiPut, apiFetch, apiDelete } from './api';

/**
 * Get the current agent's personalization config
 * @returns {Promise<{success: boolean, config: {username: string, display_name: string|null, color: string|null}}>}
 */
export async function getMyConfig() {
  return apiGet('/api/auth/agent-config');
}

/**
 * Update the current agent's personalization config
 * @param {{ display_name?: string, color?: string }} data
 */
export async function updateMyConfig(data) {
  return apiPut('/api/auth/agent-config', data);
}

/**
 * Reset the current agent's personalization (delete config)
 */
export async function resetMyConfig() {
  return apiDelete('/api/auth/agent-config');
}

/**
 * Get all agent configs (for rendering display names/colors of other advisors)
 * @returns {Promise<{success: boolean, configs: Object}>}
 */
export async function getAllConfigs() {
  return apiGet('/api/auth/all-agent-configs');
}
