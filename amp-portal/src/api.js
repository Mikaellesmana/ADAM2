// src/api.js
// ─── Shared API base URL ───────────────────────────────────────────────────────
// Empty by default: the front end calls "/api/..." on the same address it was
// loaded from. In development Vite forwards /api to the backend on port 5000
// (vite.config.js); in production the backend serves the built site itself, so
// the site works from any address (localhost, 192.168.x.x or a public domain).
// Set VITE_API_BASE only if the backend lives on a different host.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
