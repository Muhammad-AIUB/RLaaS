export const AUTH_COOKIE = 'rlaas_session';

export function getApiBaseUrl() {
  return (
    process.env.NEXT_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3000'
  );
}
