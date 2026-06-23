import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
