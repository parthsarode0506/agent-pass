/**
 * API base URL helper.
 * In development (Vite proxy), VITE_API_BASE_URL is empty → calls go to /api/...
 * In production (Firebase Hosting + Render), set VITE_API_BASE_URL=https://your-app.onrender.com
 */
const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const api = {
  get: (path, authToken) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BASE}${path}`, { headers });
  },
  post: (path, body, authToken) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  },
};
