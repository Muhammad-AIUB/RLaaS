/**
 * How long a `request_logs` row is kept. The retention job deletes rows older
 * than this, and the analytics routes default to exactly this window, so a
 * dashboard total always covers the same period the table actually holds.
 *
 * The floor is 30: a MONTHLY snapshot aggregates the previous 30 days of raw
 * rows (`AnalyticsService.defaultFrom`). The frontend mirrors this value in
 * `apps/frontend/lib/analytics-window.ts` for its labels; change both together.
 */
export const REQUEST_LOG_RETENTION_DAYS = 35;

export const REQUEST_LOG_RETENTION_MS = REQUEST_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
