import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require a logged-in dashboard/admin session. Public flows
// (freelancer portal, check-in, RSVP/NPS token pages, the login page itself)
// are intentionally excluded via the matcher below.
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
