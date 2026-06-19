// Authentication service

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = window.location.protocol === 'https:'
  ? ''  // HTTPS proxies to backend (e.g. CloudFront, nginx)
  : isLocal
    ? 'http://localhost:3001'
    : (import.meta.env.VITE_API_URL || '');

export async function login(username, password) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return response.json();
}

export function getToken() {
  return localStorage.getItem('authToken');
}

export function getUser() {
  const user = localStorage.getItem('authUser');
  return user ? JSON.parse(user) : null;
}

export function saveAuth(token, user) {
  localStorage.setItem('authToken', token);
  localStorage.setItem('authUser', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
}

export function isAuthenticated() {
  return !!getToken();
}
