/**
 * The auth barrel intentionally only re-exports the runtime-agnostic
 * `session` module so that middleware (Edge runtime) can import from
 * `@/lib/auth` without pulling in the Node-only `server` helpers.
 *
 * Server route handlers should import from `@/lib/auth/server`
 * directly.
 */
export * from './session';
