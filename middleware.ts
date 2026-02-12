import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Exclude public paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/login' ||
        pathname.includes('.') // public files like favicon.ico
    ) {
        return NextResponse.next();
    }

    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
        // If API request, return 401
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // If UI request, redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyJWT(token);

    if (!payload) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // RBAC checks can be added here if needed, or handled in specific route handlers
    // For now, we just ensure the user is authenticated

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
