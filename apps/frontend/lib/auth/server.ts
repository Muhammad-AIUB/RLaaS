import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE_SECONDS,
  getApiBaseUrl,
} from './session';

/**
 * Helpers shared by the dashboard's BFF route handlers
 * (`app/api/auth/*` and `app/api/proxy/[...path]`).
 *
 * These helpers run in the Node.js runtime (not Edge) because they
 * use Next's async cookies() API.
 */

/** Reads the session token from the httpOnly cookie. */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value ?? null;
}

/** Persists the session token in the httpOnly cookie. */
export async function writeSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Clears the session cookie. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

/** Builds an upstream URL on the RLaaS API. */
export function buildUpstreamUrl(path: string, search = ''): URL {
  const base = getApiBaseUrl();
  const url = new URL(`${base}${path}`);
  if (search) {
    url.search = search;
  }
  return url;
}

/** Best-effort JSON parsing. Returns null for empty bodies and a
 *  `{ message: <text> }` shape for non-JSON payloads. */
export async function readResponsePayload(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  } catch {
    return { message: text };
  }
}

/** Common 503 used when the upstream API can't be reached. */
export function unreachableUpstream(message = 'Unable to reach the RLaaS API.') {
  return NextResponse.json({ message }, { status: 503 });
}

/**
 * Performs a credential-exchange request against the upstream API
 * (used by both /login and /register), normalises the response,
 * sets the session cookie on success, and returns a NextResponse.
 */
export async function exchangeCredentials(
  upstreamPath: '/api/v1/auth/login' | '/api/v1/auth/register',
  body: string,
  failureMessage: string,
): Promise<NextResponse> {
  try {
    const response = await fetch(buildUpstreamUrl(upstreamPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });

    const payload = await readResponsePayload(response);

    if (!response.ok) {
      return NextResponse.json(payload ?? { message: failureMessage }, {
        status: response.status,
      });
    }

    const accessToken =
      typeof payload?.accessToken === 'string' ? payload.accessToken : null;

    if (!accessToken) {
      return NextResponse.json(
        { message: 'Authentication response did not include an access token.' },
        { status: 502 },
      );
    }

    await writeSessionCookie(accessToken);

    return NextResponse.json({ user: payload?.user ?? null });
  } catch {
    return unreachableUpstream();
  }
}
