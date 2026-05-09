/**
 * Browser-side fetch wrapper used by all dashboard pages.
 *
 * All requests go through the Next.js BFF route (`/api/proxy/*`) which:
 *  - Attaches the user's session token (httpOnly cookie) as a Bearer header
 *  - Forwards to the upstream RLaaS API at `/api/v1/*`
 *
 * The client centralises:
 *  - JSON content-type defaults
 *  - Error message shape normalisation (works with both Nest's
 *    `{ error: { message } }` and `{ message }` payloads)
 *  - Disabled cache so the dashboard always shows fresh data
 */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? 'Request failed';
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const fromError =
    typeof record.error === 'object' && record.error
      ? (record.error as Record<string, unknown>).message
      : undefined;

  const candidate = fromError ?? record.message;

  if (Array.isArray(candidate)) {
    return candidate.filter((item) => typeof item === 'string').join(', ');
  }

  return typeof candidate === 'string' ? candidate : null;
}
