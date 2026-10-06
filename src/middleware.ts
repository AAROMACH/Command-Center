import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/admin', '/tech', '/client', '/sales'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get('aaromach_session')?.value;
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Portal-level access check using the portals cookie set at login
  const portalsCookie = request.cookies.get('aaromach_portals')?.value;
  if (portalsCookie) {
    try {
      const portals: Record<string, boolean> = JSON.parse(portalsCookie);
      const HOME: Record<string, string> = {
        admin: '/admin/dashboard', sales: '/sales/pipeline', tech: '/tech/dashboard', client: '/client/dashboard',
      };
      const current = Object.keys(HOME).find(p => pathname.startsWith(`/${p}`));
      if (current && portals[current] !== true) {
        // Signed in but not for this portal — send them to the first one they have.
        const fallback = Object.keys(HOME).find(p => portals[p] === true);
        return NextResponse.redirect(new URL(fallback ? HOME[fallback] : '/portal-select', request.url));
      }
    } catch {
      // Malformed cookie — allow through (session cookie is still valid)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/tech/:path*', '/client/:path*', '/sales/:path*'],
};
