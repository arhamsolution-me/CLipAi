import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/api/inngest', '/api/webhook'];

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (!isPublic) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
