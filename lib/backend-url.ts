const DEFAULT_BACKEND_BASE_URL =
  "https://motor-de-engajamento-backend-production.up.railway.app"

/** Base URL do backend Railway (server-side). */
export function getBackendBaseUrl(): string {
  const raw = (process.env.BACKEND_BASE_URL || "").trim()
  return (raw || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, "")
}
