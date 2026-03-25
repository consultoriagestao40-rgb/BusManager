import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { parseISO, startOfDay, endOfDay, subHours, addHours } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Default to today if no date provided.
        // FIX: Server is UTC. Brazil is UTC-3.
        // If it's 22:00 BRT, it's 01:00 UTC Next Day.
        // We want "Today" to be relative to Brazil (UTC-3).
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const targetDate = dateParam ? parseISO(dateParam) : brazilNow;

        // Prisma SQLite date handling can be tricky.
        // We use range for safety to cover the "day".
        // Reverting to standard UTC day range to ensure stability.
        // We will deal with late-night events later.
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 1. Get active events for the day
        const events = await prisma.cleaningEvent.findMany({
            where: {
                data_viagem: { gte: start, lte: end },
                NOT: {
                    event_business_key: { startsWith: 'YARD-' }
                }
            },
            include: {
                vehicle: true,
                cleaner: true,
                swaps: {
                    include: {
                        replacement_vehicle: true,
                        original_vehicle: true
                    }
                }
            },
            orderBy: { hora_viagem: 'asc' }
        });

        // 2. Get ALL swaps for the day (including those on inactive versions)
        const allSwapsToday = await prisma.swap.findMany({
            where: {
                original_event: { data_viagem: { gte: start, lte: end } }
            },
            include: {
                replacement_vehicle: true,
                original_vehicle: true,
                original_event: { select: { event_business_key: true } }
            }
        });

        // 3. Get current yard inventory to sync flags
        const currentYardIds = (await prisma.yardInventory.findMany({ select: { vehicle_id: true } })).map(y => y.vehicle_id);

        // 4. Ensure all swaps are represented in the active events
        // If a swap is linked to an event that is now inactive, we find its active counterpart
        const eventsWithAllSwaps = events.map(event => {
            // Rule: If vehicle is in yard inventory, it's considered at_yard for the scale checkbox
            const autoAtYard = currentYardIds.includes(event.vehicle_id);
            
            let enrichedEvent = { 
                ...event, 
                at_yard: event.at_yard || autoAtYard 
            };

            try {
                const extraSwaps = allSwapsToday.filter(s =>
                    s.original_event?.event_business_key === enrichedEvent.event_business_key &&
                    !(enrichedEvent.swaps || []).some((existing: any) => existing.id === s.id)
                );

                if (extraSwaps.length > 0) {
                    enrichedEvent.swaps = [...(enrichedEvent.swaps || []), ...extraSwaps];
                }
            } catch (e) {
                console.error('Error merging swaps for event:', enrichedEvent.id, e);
            }
            return enrichedEvent;
        });

        return NextResponse.json({ events: eventsWithAllSwaps });

    } catch (error: any) {
        console.error('Events API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}
