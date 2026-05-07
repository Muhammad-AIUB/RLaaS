import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, getApiBaseUrl } from '@/lib/session';

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await context.params;
  const target = new URL(`${getApiBaseUrl()}/api/v1/${path.join('/')}`);
  const incomingUrl = new URL(request.url);
  target.search = incomingUrl.search;

  const body =
    request.method === 'GET' || request.method === 'DELETE'
      ? undefined
      : await request.text();

  const response = await fetch(target, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
    },
    body,
    cache: 'no-store',
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}
