import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Only check cookie presence here. Full JWT validation (signature + expiry)
// is done by the API on each request via requireAuth / GET /auth/me.
// Expired-but-present tokens are handled by Layout's silent SSO retry.
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has('token');
  if (hasSession) {
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
