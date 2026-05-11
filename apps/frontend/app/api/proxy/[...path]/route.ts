import { NextRequest, NextResponse } from 'next/server';
import { buildUpstreamUrl, readSessionToken } from '@/lib/auth/server';

interface ProxyContext {
  params: Promise<{ path: string[] }>;
}

const METHODS_WITHOUT_BODY = new Set(['GET', 'DELETE']);

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

  const response = await fetch(target, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':
        request.headers.get('content-type') ?? 'application/json',
      Connection: 'keep-alive',
    },
    body,
    cache: 'no-store',
    // @ts-expect-error — Node.js fetch supports keepAlive but TS types don't expose it
    keepalive: true,
  });

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
