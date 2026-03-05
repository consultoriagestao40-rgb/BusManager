import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, addHours, addMinutes } from 'date-fns';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { vehicle_id, empresa, motorista, observacao } = await request.json();

        if (!vehicle_id) {
            return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
        }

        // 1. Get current Brazil day
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const start = startOfDay(brazilNow);
        const end = endOfDay(brazilNow);

        // 2. Find active schedule version for today
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            return NextResponse.json({ error: 'No active schedule for today' }, { status: 400 });
        }

        // 3. Prevent duplicate active programming for this vehicle TODAY
        const existingEvent = await prisma.cleaningEvent.findFirst({
            where: {
                vehicle_id,
                data_viagem: { gte: start, lte: end },
                status: { in: ['PREVISTO', 'EM_ANDAMENTO'] }
            }
        });

        if (existingEvent) {
            return NextResponse.json({
                error: 'Este veículo já possui uma programação ativa para hoje.',
                eventId: existingEvent.id
            }, { status: 400 });
        }

        // 4. Create Cleaning Event
        const event = await prisma.cleaningEvent.create({
            data: {
                vehicle_id,
                schedule_version_id: activeVersion.id,
                data_viagem: start,
                hora_viagem: now,
                saida_programada_at: now,
                liberar_ate_at: addMinutes(now, 90),
                status: 'PREVISTO',
                empresa: empresa || 'MANUAL',
                motorista: motorista || '-',
                observacao_cliente: observacao || 'Adicionado manualmente do pátio',
                observacao_operacao: 'Sem Escala, carro do pátio',
                event_business_key: `MANUAL-${vehicle_id}-${Date.now()}`
            },
            include: {
                vehicle: true
            }
        });

        // 5. Update Yard Inventory status to EM_ANDAMENTO (Resilient update)
        try {
            await prisma.yardInventory.updateMany({
                where: { vehicle_id },
                data: { status: 'EM_ANDAMENTO' as any }
            });
        } catch (yardError) {
            console.error('Failed to update yard status but event was created:', yardError);
            // We don't fail the whole request if only the yard stock update fails
        }

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Manual Programming API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
