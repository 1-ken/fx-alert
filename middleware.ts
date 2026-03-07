import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/forgot-password', '/otp', '/api/auth'];
  
  // Check if the current path is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Get the token from the request
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // If route requires authentication but user is not authenticated
  if (!isPublicRoute && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is authenticated and trying to access login page, redirect to dashboard
  if (token && (pathname === '/login' || pathname.startsWith('/login'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is authenticated and accessing root, redirect to dashboard
  if (token && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is not authenticated and accessing root, redirect to login
  if (!token && pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Allow access to public routes and authenticated users
  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes - allow these)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - assets (static assets from public folder)
     * - icons (static icons from public folder)
     * - sw.js, manifest.json (PWA files)
     * - public folder
     * - _vercel (Vercel internal routes)
     * - robots.txt, sitemap.xml (SEO files)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|icons|sw.js|manifest.json|_vercel|robots.txt|sitemap.xml).*)",
  ],
};
