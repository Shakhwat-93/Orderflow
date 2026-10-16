import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Enterprise Security Middleware
 * 1. Enforces HTTPS redirection for all plain HTTP incoming traffic behind reverse proxies.
 * 2. Canonicalizes www.canvasorder.shop -> canvasorder.shop.
 * 3. Enforces HTTP Strict Transport Security (HSTS) and Content-Security-Policy upgrade-insecure-requests.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const forwardedProto = request.headers.get('x-forwarded-proto') || '';

  const isLocal =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('192.168.') ||
    host.includes('sslip.io');

  // 1. Canonical Domain Redirection: www.canvasorder.shop -> canvasorder.shop
  if (host === 'www.canvasorder.shop') {
    const canonicalUrl = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      'https://canvasorder.shop'
    );
    return NextResponse.redirect(canonicalUrl, 301);
  }

  // 2. Enforce HTTPS in production: If reverse proxy forwarded via HTTP, redirect to HTTPS
  if (!isLocal && forwardedProto === 'http') {
    const secureUrl = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      `https://${host}`
    );
    return NextResponse.redirect(secureUrl, 301);
  }

  const response = NextResponse.next();

  // 3. Inject Enterprise Security Headers on all non-local responses
  if (!isLocal) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
    response.headers.set('Content-Security-Policy', 'upgrade-insecure-requests');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.webmanifest, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|notification.mp3|orderflow-logo.png|nova-ai-logo.png).*)',
  ],
};
