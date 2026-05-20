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
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        let { replacementVehicleNumber, motivo, observacao } = await request.json();

        if (!replacementVehicleNumber || !motivo) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // FIX: Map frontend reasons to backend Enum if they don't exist
        // Backend supports: QUEBRA, ONIBUS_NAO_CHEGOU_NO_HORARIO, MANUTENCAO, OUTROS
        // Frontend sends: QUEBRA, RODIZIO, RESERVA, OUTRO
        const validReasons = ['QUEBRA', 'ONIBUS_NAO_CHEGOU_NO_HORARIO', 'MANUTENCAO', 'CARRO_NAO_ESTA_NO_PATIO', 'OUTROS'];

        if (!validReasons.includes(motivo)) {
            // Append original reason to observation
            observacao = `[Motivo: ${motivo}] ${observacao || ''}`;
            // Fallback to OUTROS
            motivo = 'OUTROS';
        }

        const event = await prisma.cleaningEvent.findUnique({
            where: { id },
            include: { vehicle: true }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Lock validation: prevent swapping other cars if there is a pending critical yard event
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

            // If a critical yard event exists and it is NOT this event, block the action
            if (criticalYardEvent && criticalYardEvent.id !== id) {
                return NextResponse.json({
                    error: `Ação bloqueada! Existe uma pendência operacional crítica: o carro ${criticalYardEvent.vehicle.client_vehicle_number} está escalado mas NÃO foi confirmado no pátio (faltando menos de 30 min para iniciar a limpeza). Por favor, confirme-o no pátio ou realize a troca para restabelecer as operações do sistema.`
                }, { status: 400 });
            }
        }

        // Find or create replacement vehicle
        // Assuming we look up by client_vehicle_number
        let replacementVehicle = await prisma.vehicle.findUnique({
            where: { client_vehicle_number: replacementVehicleNumber }
        });

        if (!replacementVehicle) {
            // Create if it doesn't exist? Or require it to exist?
            // Usually swap implies a known vehicle. Let's create it on fly if needed for MVP.
            replacementVehicle = await prisma.vehicle.create({
                data: { client_vehicle_number: replacementVehicleNumber }
            });
        }

        // Use centralized event service for swap logic
        const { swapVehicle } = await import('@/lib/event-service');
        await swapVehicle(id, user.id, {
            replacement_vehicle_id: replacementVehicle.id,
            motivo: motivo,
            observacao: observacao
        });

        // Fetch updated event to return
        const updatedEvent = await prisma.cleaningEvent.findUnique({
            where: { id },
            include: { vehicle: true }
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error) {
        console.error('Swap Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
