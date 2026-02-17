import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { parseISO, startOfDay, endOfDay, subHours } from 'date-fns';

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
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        const events = await prisma.cleaningEvent.findMany({
            where: {
                data_viagem: {
                    gte: start,
                    lte: end
                },
                // We only want the events from the ACTIVE version for this day.
                schedule_version: {
                    is_active: true
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
            orderBy: {
                hora_viagem: 'asc'
            }
        });

        return NextResponse.json({ events });

    } catch (error) {
        console.error('Events API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
