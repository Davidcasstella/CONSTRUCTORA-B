// Base API service with JWT authentication

// Auto-detect: localhost → local backend, remote → use env var or same-origin
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = window.location.protocol === 'https:'
  ? ''  // HTTPS proxies to backend (e.g. CloudFront, nginx)
  : isLocal
    ? 'http://localhost:3001'
    : (import.meta.env.VITE_API_URL || '');

/**
 * Authenticated fetch wrapper.
 * Automatically attaches JWT token and handles 401 redirects.
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('authToken');

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set Content-Type for JSON payloads (not FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      window.location.href = '/login';
      return;
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`Request to ${url} timed out`);
      throw new Error("Request timed out");
    }
    throw error;
  }
}

/**
 * GET request
 */
export async function apiGet(url) {
  const res = await apiFetch(url);
  if (!res) return null;
  return res.json();
}

/**
 * POST request with JSON body
 */
export async function apiPost(url, data) {
  const res = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res) return null;
  return res.json();
}

/**
 * POST request with FormData (file uploads)
 */
export async function apiPostForm(url, formData) {
  const res = await apiFetch(url, {
    method: 'POST',
    body: formData,
  });
  if (!res) return null;
  return res.json();
}

/**
 * PUT request with JSON body
 */
export async function apiPut(url, data) {
  const res = await apiFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res) return null;
  return res.json();
}

/**
 * DELETE request
 */
export async function apiDelete(url) {
  const res = await apiFetch(url, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}
