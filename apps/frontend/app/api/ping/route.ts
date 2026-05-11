import { getApiBaseUrl } from '@/lib/auth/session';

export const runtime = 'edge';

export async function GET() {
  try {
    await fetch(`${getApiBaseUrl()}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Best-effort — ignore failures
  }
  return new Response('ok', { status: 200 });
}
