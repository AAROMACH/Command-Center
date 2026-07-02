import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/admin', '/tech', '/client'];

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
      if (pathname.startsWith('/admin') && portals.admin === false) {
        // Has session but no admin portal access — redirect to the first accessible portal
        if (portals.tech) return NextResponse.redirect(new URL('/tech/dashboard', request.url));
        if (portals.client) return NextResponse.redirect(new URL('/client/dashboard', request.url));
        return NextResponse.redirect(new URL('/portal-select', request.url));
      }
      if (pathname.startsWith('/tech') && portals.tech === false) {
        if (portals.admin) return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        if (portals.client) return NextResponse.redirect(new URL('/client/dashboard', request.url));
        return NextResponse.redirect(new URL('/portal-select', request.url));
      }
      if (pathname.startsWith('/client') && portals.client === false) {
        if (portals.admin) return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        if (portals.tech) return NextResponse.redirect(new URL('/tech/dashboard', request.url));
        return NextResponse.redirect(new URL('/portal-select', request.url));
      }
    } catch {
      // Malformed cookie — allow through (session cookie is still valid)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/tech/:path*', '/client/:path*'],
};
