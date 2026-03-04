import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, parseISO, format } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const fix = searchParams.get('fix') === 'true';

        const now = new Date();
        const targetDate = dateParam ? parseISO(dateParam) : subHours(now, 3);
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 1. Get ALL swaps for the day
        const allSwaps = await prisma.swap.findMany({
            where: {
                created_at: { gte: start, lte: end }
            },
            include: {
                original_event: { include: { vehicle: true, schedule_version: true } },
                original_vehicle: true,
                replacement_vehicle: true,
                created_by: { select: { name: true, email: true } }
            }
        });

        if (fix) {
            // Aggressive recovery logic
            const activeVersion = await prisma.scheduleVersion.findFirst({
                where: { data_viagem: { gte: start, lte: end }, is_active: true }
            });

            if (activeVersion) {
                const activeEvents = await prisma.cleaningEvent.findMany({
                    where: { schedule_version_id: activeVersion.id },
                    include: { vehicle: true }
                });

                let fixedCount = 0;
                for (const swap of allSwaps) {
                    if (swap.original_event.schedule_version_id === activeVersion.id) continue;

                    // Try matching by business key
                    let match = activeEvents.find(e => e.event_business_key === swap.original_event.event_business_key);

                    // Fallback 1: Match by vehicle + time string
                    if (!match) {
                        match = activeEvents.find(e =>
                            e.vehicle.client_vehicle_number === swap.original_event.vehicle.client_vehicle_number &&
                            format(e.hora_viagem, 'HH:mm') === format(swap.original_event.hora_viagem, 'HH:mm')
                        );
                    }

                    // Fallback 2: Match by SERVICE NUMBER if available
                    if (!match && swap.original_event.numero_servico) {
                        match = activeEvents.find(e => e.numero_servico === swap.original_event.numero_servico);
                    }

                    if (match) {
                        await prisma.swap.update({
                            where: { id: swap.id },
                            data: { original_event_id: match.id }
                        });
                        fixedCount++;
                    }
                }
                return NextResponse.json({
                    message: `Fix applied. Migrated ${fixedCount} swaps.`,
                    swaps: allSwaps
                });
            }
        }

        return NextResponse.json({
            date: format(targetDate, 'yyyy-MM-dd'),
            count: allSwaps.length,
            swaps: allSwaps.map(s => ({
                id: s.id,
                time: format(s.created_at, 'HH:mm:ss'),
                user: s.created_by.email,
                original_vehicle: s.original_vehicle.client_vehicle_number,
                new_vehicle: s.replacement_vehicle?.client_vehicle_number,
                motivo: s.motivo,
                obs: s.observacao,
                is_linked_to_active: s.original_event.schedule_version.is_active
            }))
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
