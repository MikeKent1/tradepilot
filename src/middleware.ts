import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Auth is handled client-side by AuthProvider.
  // The middleware simply passes through all requests.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};