
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken, hashPassword } from '@/lib/auth';
import { cookies } from 'next/headers';

// GET: List all users (Admin only)
export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                active: true,
                created_at: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Users API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Create new user (Admin only)
export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, email, password, role } = body;

        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
        }

        const password_hash = await hashPassword(password);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password_hash,
                role,
                active: true
            }
        });

        // Don't return the hash
        const { password_hash: _, ...userWithoutHash } = newUser;

        return NextResponse.json({ user: userWithoutHash }, { status: 201 });

    } catch (error) {
        console.error('Create User API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
