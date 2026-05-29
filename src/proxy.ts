import { NextResponse, type NextRequest } from 'next/server';

export default async function proxy(request: NextRequest) {
  // Auth is handled client-side by AuthProvider.
  // The proxy simply passes through all requests.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};