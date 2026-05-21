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

        if (user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Acesso negado: Apenas administradores podem liberar o bloqueio operacional.' }, { status: 403 });
        }

        const { yard_bypass } = await request.json();

        if (typeof yard_bypass !== 'boolean') {
            return NextResponse.json({ error: 'Invalid yard_bypass value' }, { status: 400 });
        }

        const updatedEvent = await prisma.cleaningEvent.update({
            where: { id },
            data: { yard_bypass }
        });

        // Add audit log for bypass action
        try {
            await prisma.auditLog.create({
                data: {
                    entity_type: 'CleaningEvent',
                    entity_id: id,
                    action: yard_bypass ? 'BYPASS_YARD_LOCK' : 'REMOVE_BYPASS_YARD_LOCK',
                    user_id: user.id,
                    details: {
                        message: yard_bypass 
                            ? `Admin ${user.name} liberou o bloqueio operacional para o evento.` 
                            : `Admin ${user.name} removeu a liberação do bloqueio operacional.`
                    }
                }
            });
        } catch (e) {
            console.error('Failed to create bypass audit log:', e);
        }

        return NextResponse.json({ event: updatedEvent });

    } catch (error: any) {
        console.error('Bypass Toggle Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
