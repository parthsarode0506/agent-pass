/**
 * API base URL helper.
 * In development (Vite proxy), VITE_API_BASE_URL is empty → calls go to /api/...
 * In production (Firebase Hosting + Render), set VITE_API_BASE_URL=https://your-app.onrender.com
 */
const BASE = import.meta.env.VITE_API_BASE_URL || '';

export const api = {
  get: (path) => fetch(`${BASE}${path}`),
  post: (path, body) =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
