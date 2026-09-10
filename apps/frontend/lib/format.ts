/**
 * Presentation formatting for values that arrive from the API in machine shape.
 *
 * The rule (DESIGN.md, "Copy"): database vocabulary never reaches the screen.
 * `SLIDING_WINDOW_COUNTER` is a column value, not a label. `3600` is a number of
 * seconds, not "3600s". Every helper here is pure and safe on unknown input —
 * the API types these fields as `string`, so a value the UI has never seen
 * degrades to something readable rather than throwing.
 */

/** `SLIDING_WINDOW_COUNTER` -> `Sliding window counter`. */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.trim().replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ALGORITHM_LABELS: Record<string, string> = {
  FIXED_WINDOW: 'Fixed window',
  SLIDING_WINDOW_LOG: 'Sliding window log',
  SLIDING_WINDOW_COUNTER: 'Sliding window counter',
  TOKEN_BUCKET: 'Token bucket',
};

/** Short forms for axis ticks and dense table cells, where the full name wraps. */
const ALGORITHM_SHORT: Record<string, string> = {
  FIXED_WINDOW: 'Fixed',
  SLIDING_WINDOW_LOG: 'Window log',
  SLIDING_WINDOW_COUNTER: 'Sliding',
  TOKEN_BUCKET: 'Token bucket',
};

const SCOPE_LABELS: Record<string, string> = {
  IP: 'IP address',
  API_KEY: 'API key',
  USER_TIER: 'User tier',
  ENDPOINT: 'Endpoint',
  GLOBAL: 'Global',
};

export function algorithmLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return ALGORITHM_LABELS[value] ?? humanizeEnum(value);
}

export function algorithmShortLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return ALGORITHM_SHORT[value] ?? humanizeEnum(value);
}

export function scopeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return SCOPE_LABELS[value] ?? humanizeEnum(value);
}

/**
 * Seconds as an operator would say them: `3600` -> `1h`, `90` -> `1m 30s`.
 * Only the two largest non-zero units are shown; nobody reads "1h 0m 30s".
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '—';
  }
  if (seconds === 0) return '0s';

  const negative = seconds < 0;
  let remaining = Math.round(Math.abs(seconds));

  const units: Array<[number, string]> = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's'],
  ];

  const parts: string[] = [];
  for (const [size, suffix] of units) {
    if (remaining >= size) {
      parts.push(`${Math.floor(remaining / size)}${suffix}`);
      remaining %= size;
    }
    if (parts.length === 2) break;
  }

  return (negative ? '-' : '') + parts.join(' ');
}

/** Milliseconds, kept precise under a second because latency is the point. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

/** Grouped digits for anything a human reads as a quantity. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('en-US');
}

/**
 * Abbreviated counts for axis ticks and chips where the column is narrow.
 * Full precision still belongs in tooltips and tables.
 */
export function formatCompactCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  if (abs < 1_000_000) {
    const k = value / 1000;
    return `${abs < 10_000 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
  }
  const m = value / 1_000_000;
  return `${abs < 10_000_000 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(fractionDigits).replace(/\.0$/, '')}%`;
}

/**
 * Recent events read better as elapsed time — an operator scanning a log wants
 * "12s ago", not a wall-clock timestamp they have to subtract from now. Past a
 * day the absolute date is the more useful answer, so it switches over.
 */
export function formatRelativeTime(
  input: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(input);
  if (!date) return '—';

  const deltaSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (deltaSeconds < 0) return 'just now';
  if (deltaSeconds < 5) return 'just now';
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  if (deltaSeconds < 604800) return `${Math.floor(deltaSeconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** Wall clock, zero-padded so a column of them aligns. */
export function formatClockTime(
  input: string | number | Date | null | undefined,
): string {
  const date = toDate(input);
  if (!date) return '—';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Full timestamp for `title` attributes, so hover always gives the exact value. */
export function formatAbsolute(
  input: string | number | Date | null | undefined,
): string {
  const date = toDate(input);
  if (!date) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDate(
  input: string | number | Date | null | undefined,
): string {
  const date = toDate(input);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}
