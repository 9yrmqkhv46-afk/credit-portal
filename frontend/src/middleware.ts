import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The dedicated admin login portal is a PUBLIC page. The route matcher below
  // ('/admin/:path*') does not match '/admin-login', so this code normally
  // won't even run for it — but the checks below use startsWith('/admin'),
  // which would treat '/admin-login' as protected if it ever did. Guard
  // explicitly so the admin sign-in page is always reachable without a token.
  if (pathname === '/admin-login') {
    return NextResponse.next();
  }

  // Check for token in cookies (set during login for middleware access)
  const token = request.cookies.get('token')?.value;

  // Protected routes that require authentication
  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require admin role (stored in cookie)
  const isAdminRoute = pathname.startsWith('/admin');
  if (isAdminRoute && token) {
    const role = request.cookies.get('role')?.value;
    if (role !== 'ADMIN') {
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
