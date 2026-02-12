import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { completeEvent } from '@/lib/event-service';

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

        const event = await prisma.cleaningEvent.findUnique({
            where: { id }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        if (event.status === 'CONCLUIDO') {
            return NextResponse.json({ error: 'Event already completed' }, { status: 400 });
        }

        const body = await request.json();
        const { check_interno, check_externo, check_pneus, observacao_operacao } = body;

        const updatedEvent = await completeEvent(id, user.id, {
            check_interno,
            check_externo,
            check_pneus,
            observacao_operacao
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error) {
        console.error('Finish Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
