import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Authentication middleware for FX Alert frontend
 * 
 * Handles:
 * - Page-level authentication and redirects
 * - Root path routing based on auth state
 * - Login/logout flow
 * 
 * Note: API routes are excluded from middleware and handle their own authentication
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require NextAuth (admin uses its own OTP + secret path)
  const publicPageRoutes = ['/login', '/admin'];
  const isPublicPage = publicPageRoutes.some(route => pathname.startsWith(route));

  // Get authentication token
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  const isAuthenticated = !!token;

  // Handle root path routing
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from login page
  if (isAuthenticated && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Protect all non-public pages - require authentication
  if (!isPublicPage && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the attempted URL for redirect after login
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Export as default for Next.js proxy
export default middleware;

/**
 * Middleware matcher configuration
 * 
 * Runs middleware on all routes except:
 * - /api/* - API routes handle their own authentication
 * - /_next/* - Next.js internals
 * - /favicon.ico, /assets/*, /icons/* - Static files
 * - /sw.js, /manifest.json - PWA files
 * - SEO files (robots.txt, sitemap.xml)
 */
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|assets|icons|sw.js|workbox-|worker-|manifest.json|_vercel|robots.txt|sitemap.xml).*)',
  ],
};
