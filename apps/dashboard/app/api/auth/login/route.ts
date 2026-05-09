import { exchangeCredentials } from '@/lib/auth/server';

export async function POST(request: Request) {
  const body = await request.text();
  return exchangeCredentials('/api/v1/auth/login', body, 'Login failed');
}
