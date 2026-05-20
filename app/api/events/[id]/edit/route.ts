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
        
        // Lock validation: prevent editing if there is a pending critical yard event
        const nowTime = new Date();
        const ninetyMinutesFromNow = new Date(nowTime.getTime() + 90 * 60 * 1000);
        
        const { subHours: subHoursLock, startOfDay: startOfDayLock, endOfDay: endOfDayLock } = await import('date-fns');
        const brazilNow = subHoursLock(nowTime, 3);
        const start = startOfDayLock(brazilNow);
        const end = endOfDayLock(brazilNow);
        
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (activeVersion) {
            const criticalYardEvent = await prisma.cleaningEvent.findFirst({
                where: {
                    schedule_version_id: activeVersion.id,
                    status: 'PREVISTO',
                    at_yard: false,
                    liberar_ate_at: {
                        lte: ninetyMinutesFromNow
                    },
                    NOT: {
                        event_business_key: { startsWith: 'YARD-' }
                    }
                },
                include: { vehicle: true }
            });

            if (criticalYardEvent) {
                return NextResponse.json({
                    error: `Ação bloqueada! Existe uma pendência operacional crítica: o carro ${criticalYardEvent.vehicle.client_vehicle_number} está escalado mas NÃO foi confirmado no pátio (faltando menos de 30 min para iniciar a limpeza). Por favor, confirme-o no pátio ou realize a troca para restabelecer as operações do sistema.`
                }, { status: 400 });
            }
        }

        const updatedEvent = await editEvent(id, user.id, data);

        return NextResponse.json({ event: updatedEvent });

    } catch (error: any) {
        console.error('Edit Event Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
