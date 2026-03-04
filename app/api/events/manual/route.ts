import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours } from 'date-fns';

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

        // 3. Create Cleaning Event
        const event = await prisma.cleaningEvent.create({
            data: {
                vehicle_id,
                schedule_version_id: activeVersion.id,
                data_viagem: start,
                hora_viagem: now,
                saida_programada_at: now,
                liberar_ate_at: now,
                status: 'PREVISTO',
                empresa: empresa || 'MANUAL',
                motorista: motorista || '-',
                observacao_cliente: observacao || 'Adicionado manualmente do pátio',
                event_business_key: `MANUAL-${vehicle_id}-${Date.now()}`
            },
            include: {
                vehicle: true
            }
        });

        // 4. Remove from Yard Inventory
        await prisma.yardInventory.deleteMany({
            where: { vehicle_id }
        });

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Manual Programming API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
