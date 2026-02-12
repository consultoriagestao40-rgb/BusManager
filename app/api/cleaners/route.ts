import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cleaners = await prisma.cleaner.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json({ cleaners });

    } catch (error) {
        console.error('List Cleaners Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { name } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const cleaner = await prisma.cleaner.create({
            data: { name }
        });

        return NextResponse.json({ cleaner });

    } catch (error) {
        console.error('Create Cleaner Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
