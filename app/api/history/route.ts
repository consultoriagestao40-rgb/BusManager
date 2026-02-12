import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { cookies } from 'next/headers';
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

        // Filters
        const startDateParam = searchParams.get('startDate'); // YYYY-MM-DD
        const endDateParam = searchParams.get('endDate');     // YYYY-MM-DD
        const vehiclePrefix = searchParams.get('vehicle');    // Partial match on prefix or number
        const status = searchParams.get('status');

        const whereClause: any = {
            // By default, if no date range, show last 30 days? Or just today?
            // Let's require at least a default range in frontend, but handle here.
        };

        if (startDateParam) {
            whereClause.data_viagem = {
                ...(whereClause.data_viagem || {}),
                gte: startOfDay(parseISO(startDateParam))
            };
        }

        if (endDateParam) {
            whereClause.data_viagem = {
                ...(whereClause.data_viagem || {}),
                lte: endOfDay(parseISO(endDateParam))
            };
        }

        if (vehiclePrefix) {
            whereClause.vehicle = {
                client_vehicle_number: {
                    contains: vehiclePrefix
                }
            };
        }

        if (status && status !== 'ALL') {
            whereClause.status = status;
        }

        // Only active versions history??
        // Usually history should show what happened. Even if version changed.
        // But for now let's stick to active schedule versions to avoid duplicates if re-imported.
        whereClause.schedule_version = {
            is_active: true
        };

        const events = await prisma.cleaningEvent.findMany({
            where: whereClause,
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
                data_viagem: 'desc', // Most recent first
            },
            take: 200 // Limit to prevent massive loads
        });

        return NextResponse.json({ events });

    } catch (error) {
        console.error('History API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
