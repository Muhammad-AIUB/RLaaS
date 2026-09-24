/**
 * The period every analytics total on the dashboard covers.
 *
 * The API defaults `from` to 35 days ago because request logs are deleted
 * after 35 days (`REQUEST_LOG_RETENTION_DAYS` in
 * `apps/backend/src/request-log-retention/request-log-retention.constants.ts`).
 * This file only labels that window; change both together.
 */
export const ANALYTICS_WINDOW_DAYS = 35;

/** Sentence-case label for tiles and headers: "Last 35 days". */
export const ANALYTICS_WINDOW_LABEL = `Last ${ANALYTICS_WINDOW_DAYS} days`;

/** Lower-case phrase for use mid-sentence: "the last 35 days". */
export const ANALYTICS_WINDOW_PHRASE = `the last ${ANALYTICS_WINDOW_DAYS} days`;
