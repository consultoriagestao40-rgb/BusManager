import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

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

        const updatedEvent = await prisma.cleaningEvent.update({
            where: { id },
            data: {
                status: 'CONCLUIDO',
                finished_at: new Date(),
                completed_by_user_id: user.id
            }
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error) {
        console.error('Finish Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
