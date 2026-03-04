import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, parseISO } from 'date-fns';

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

        const now = new Date();
        const brazilNow = subHours(now, 3);
        const targetDate = dateParam ? parseISO(dateParam) : brazilNow;

        // Use a wider range to be safe from timezone issues during recovery
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 1. Diagnostics: Show all versions for today
        const allVersions = await prisma.scheduleVersion.findMany({
            where: { data_viagem: { gte: start, lte: end } },
            orderBy: { version_number: 'desc' }
        });

        const activeVersion = allVersions.find(v => v.is_active);

        if (!activeVersion) {
            return NextResponse.json({
                error: 'Nenhuma versão ativa encontrada para esta data.',
                diagnostics: {
                    targetDate: targetDate.toISOString(),
                    foundVersions: allVersions.length,
                    versions: allVersions.map(v => ({ id: v.id, v: v.version_number, active: v.is_active }))
                }
            }, { status: 404 });
        }

        // 2. Map active events
        const activeEvents = await prisma.cleaningEvent.findMany({
            where: { schedule_version_id: activeVersion.id },
            include: { vehicle: true }
        });

        // Map by business key AND by (vehicle + time) as fallback
        const activeEventsByKey = new Map(activeEvents.map(e => [e.event_business_key, e.id]));
        const activeEventsByVehicleTime = new Map(activeEvents.map(e => [
            `${e.vehicle.client_vehicle_number}-${e.hora_viagem.toISOString()}`,
            e.id
        ]));

        // 3. Find ALL swaps for today
        const allSwapsToday = await prisma.swap.findMany({
            where: {
                original_event: {
                    data_viagem: { gte: start, lte: end }
                }
            },
            include: {
                original_event: {
                    include: { vehicle: true, schedule_version: true }
                }
            }
        });

        const lostSwaps = allSwapsToday.filter(s => s.original_event.schedule_version_id !== activeVersion.id);

        let migratedCount = 0;
        const results = [];

        // 4. Migrate
        for (const swap of lostSwaps) {
            const businessKey = swap.original_event.event_business_key;
            let newEventId = activeEventsByKey.get(businessKey);

            // Fallback: match by vehicle number and time
            if (!newEventId) {
                const vehicleTimeKey = `${swap.original_event.vehicle.client_vehicle_number}-${swap.original_event.hora_viagem.toISOString()}`;
                newEventId = activeEventsByVehicleTime.get(vehicleTimeKey);
            }

            if (newEventId) {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { original_event_id: newEventId }
                });
                migratedCount++;
                results.push(`Swapped ${swap.id}: migrated to active event.`);
            } else {
                results.push(`Swapped ${swap.id}: NO MATCH FOUND for Key ${businessKey} or Vehicle ${swap.original_event.vehicle.client_vehicle_number}`);
            }
        }

        return NextResponse.json({
            success: true,
            diagnostics: {
                targetDate: targetDate.toISOString(),
                activeVersion: { id: activeVersion.id, number: activeVersion.version_number },
                totalSwapsToday: allSwapsToday.length,
                alreadyActiveSwaps: allSwapsToday.length - lostSwaps.length,
                lostSwapsFound: lostSwaps.length,
                migratedCount: migratedCount
            },
            details: results
        });

    } catch (error: any) {
        console.error('Recovery API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
