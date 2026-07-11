/**
 * API base URL helper.
 *
 * - Local dev (localhost): Vite proxies /api → localhost:8080, so base = ''
 * - Production (Firebase Hosting): calls go to the Render.com backend
 *
 * Set VITE_API_URL in .env.production to your Render service URL,
 * e.g.  VITE_API_URL=https://agentid-backend.onrender.com
 */
const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/$/, '') // strip trailing slash
    : '';

/**
 * Returns the full URL for an API path.
 * @param {string} path - e.g. '/api/agents'
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
