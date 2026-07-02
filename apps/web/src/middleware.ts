import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Decode the JWT payload and check only the expiry claim.
// No signature verification — that stays with the API (requireAuth).
// This is enough to catch expired tokens before the dashboard renders,
// breaking the /login → SSO → /dashboard → auth/me-401 loop.
function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!json.exp) return false;
    return json.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (token && !isTokenExpired(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/events/:path*',
    '/venues/:path*',
    '/reports/:path*',
    '/admin/:path*',
    '/cozinha/:path*',
  ],
};
