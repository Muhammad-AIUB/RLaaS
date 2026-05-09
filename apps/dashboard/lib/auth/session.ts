/**
 * Session/auth constants and helpers shared by:
 *  - Next.js middleware (Edge runtime)
 *  - BFF API routes under app/api/auth/*
 *
 * Keep this module dependency-free so it remains importable from the
 * Edge runtime.
 */

export const AUTH_COOKIE = 'rlaas_session';

/** Default cookie max-age for the session token (24h). */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Resolves the upstream RLaaS API base URL.
 *
 * - `NEXT_INTERNAL_API_URL` is preferred for server-to-server traffic
 *   (e.g. when the API lives on a private network in production).
 * - `NEXT_PUBLIC_API_URL` is the public fallback.
 * - Falls back to local Docker compose port for development.
 */
export function getApiBaseUrl(): string {
  return (
    process.env.NEXT_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3000'
  );
}
