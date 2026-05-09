import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getApiBaseUrl } from '@/lib/session';

async function readResponsePayload(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
    });

    const payload = await readResponsePayload(response);

    if (!response.ok) {
      return NextResponse.json(
        payload ?? { message: 'Login failed' },
        { status: response.status },
      );
    }

    const accessToken =
      typeof payload?.accessToken === 'string' ? payload.accessToken : null;

    if (!accessToken) {
      return NextResponse.json(
        { message: 'Authentication response did not include an access token.' },
        { status: 502 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return NextResponse.json({
      user: payload?.user ?? null,
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to reach the RLaaS API.' },
      { status: 503 },
    );
  }
}
