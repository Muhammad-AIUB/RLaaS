import { buildUpstreamUrl, unreachableUpstream } from '@/lib/auth/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(buildUpstreamUrl('/api/v1/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return unreachableUpstream();
  }
}
