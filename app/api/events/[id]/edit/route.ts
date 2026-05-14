import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { editEvent } from '@/lib/event-service';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const data = await request.json();
        
        const updatedEvent = await editEvent(id, user.id, data);

        return NextResponse.json({ event: updatedEvent });

    } catch (error: any) {
        console.error('Edit Event Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
