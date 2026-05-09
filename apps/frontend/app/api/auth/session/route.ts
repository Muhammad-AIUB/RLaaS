import { NextResponse } from 'next/server';
import {
  buildUpstreamUrl,
  readResponsePayload,
  readSessionToken,
  unreachableUpstream,
} from '@/lib/auth/server';

export async function GET() {
  const token = await readSessionToken();

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const response = await fetch(buildUpstreamUrl('/api/v1/users/me'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const payload = await readResponsePayload(response);

    if (!response.ok) {
      return NextResponse.json(payload ?? { message: 'Unable to load session' }, {
        status: response.status,
      });
    }

    return NextResponse.json(payload);
  } catch {
    return unreachableUpstream();
  }
}
