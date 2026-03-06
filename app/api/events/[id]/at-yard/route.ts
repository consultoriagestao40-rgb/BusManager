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

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Perfil de visualização apenas.' }, { status: 403 });
        }
        
        const { at_yard } = await request.json();

        if (typeof at_yard !== 'boolean') {
            return NextResponse.json({ error: 'Invalid at_yard value' }, { status: 400 });
        }

        const updatedEvent = await prisma.cleaningEvent.update({
            where: { id },
            data: { at_yard }
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error: any) {
        console.error('At Yard Toggle Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
