import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

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

        // Default to today if no date provided
        const targetDate = dateParam ? parseISO(dateParam) : new Date();

        // Prisma SQLite date handling can be tricky.
        // Ideally we store as DateTime. 
        // For "Data Viagem", we might need to query by range to cover the "day".
        // Or if we stored as strict midnight Date, exact match might work.
        // Let's use range for safety.

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
