import { NextRequest, NextResponse } from 'next/server';
import { buildUpstreamUrl } from '@/lib/auth/server';

/**
 * Public BFF proxy for the demo rate-limit check.
 * No auth required — forwards directly to the backend demo endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const response = await fetch(buildUpstreamUrl('/api/v1/gateway/demo-check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  } catch {
    return NextResponse.json({ message: 'Demo service unavailable' }, { status: 503 });
  }
}
