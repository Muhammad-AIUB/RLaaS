import { NextRequest, NextResponse } from 'next/server';
import { buildUpstreamUrl, readSessionToken } from '@/lib/auth/server';

interface ProxyContext {
  params: Promise<{ path: string[] }>;
}

const METHODS_WITHOUT_BODY = new Set(['GET', 'DELETE']);

/**
 * Long enough for a cold upstream (Render free tier sleeps), short enough that
 * a dashboard request cannot hang forever. There was no timeout at all.
 */
const UPSTREAM_TIMEOUT_MS = 30_000;

async function forward(request: NextRequest, context: ProxyContext) {
  const token = await readSessionToken();

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const target = buildUpstreamUrl(
    `/api/v1/${path.join('/')}`,
    incomingUrl.search,
  );

  const body = METHODS_WITHOUT_BODY.has(request.method)
    ? undefined
    : await request.text();

  /**
   * `keepalive: true` and a hand-set `Connection` header were both removed.
   *
   * `Connection` is a forbidden header name in fetch, and `keepalive` is meant
   * for unload-time beacons — it caps the body at 64 KiB and pins the request
   * to a pooled socket. Together they made the proxy hold sockets to the API
   * that did not survive an API restart: after the backend was restarted the
   * dashboard's requests hung indefinitely, with no error and no timeout, until
   * the Next process itself was restarted. On Render that is every deploy.
   *
   * With no timeout there was also no ceiling on a slow upstream: one hung
   * request held a dashboard page on its skeleton forever.
   */
  let response: Response;

  try {
    response = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type':
          request.headers.get('content-type') ?? 'application/json',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    // A dead socket, a refused connection or the timeout above. The upstream
    // failed, not the caller, so this is 504 rather than 500 — and it is an
    // answer, which is what the dashboard needs in order to show an error
    // state instead of spinning.
    const timedOut = error instanceof Error && error.name === 'TimeoutError';

    return NextResponse.json(
      {
        message: timedOut
          ? 'The API did not respond in time.'
          : 'Could not reach the API.',
      },
      { status: 504 },
    );
  }

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function GET(request: NextRequest, context: ProxyContext) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: ProxyContext) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: ProxyContext) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: ProxyContext) {
  return forward(request, context);
}
