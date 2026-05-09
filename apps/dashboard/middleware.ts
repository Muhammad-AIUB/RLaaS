import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/session';

/**
 * Edge-runtime middleware that gates dashboard routes:
 *  - Redirects unauthenticated users hitting protected pages to /login
 *  - Redirects already-signed-in users away from /login and /register
 *
 * Imports must remain runtime-safe (no Node-only APIs); that is why
 * this file imports from `@/lib/auth/session` and not the
 * Node-runtime `@/lib/auth/server` module.
 */

const AUTH_ROUTES = new Set(['/login', '/register']);

function isProtected(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/projects')
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  if (isProtected(pathname) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (AUTH_ROUTES.has(pathname) && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/dashboard/:path*', '/projects/:path*'],
};
