import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startEvent } from '@/lib/event-service';

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
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const event = await prisma.cleaningEvent.findUnique({
            where: { id }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        if (event.status === 'CONCLUIDO' || event.status === 'CANCELADO') {
            return NextResponse.json({ error: 'Event cannot be started' }, { status: 400 });
        }

        const { cleanerId } = await request.json();

        if (!cleanerId) {
            return NextResponse.json({ error: 'Cleaner ID is required' }, { status: 400 });
        }

        const updatedEvent = await startEvent(id, user.id, cleanerId);

        // Create log? Optional for now, but good practice.
        // await prisma.auditLog.create(...)

        return NextResponse.json({ event: updatedEvent });

    } catch (error) {
        console.error('Start Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
