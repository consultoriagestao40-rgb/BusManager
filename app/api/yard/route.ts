import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours } from 'date-fns';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const yardItems = await prisma.yardInventory.findMany({
            include: {
                vehicle: true,
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        // Current Brazil Day
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const start = startOfDay(brazilNow);
        const end = endOfDay(brazilNow);

        // Enrich with cleaner names
        const enrichedItems = await Promise.all(yardItems.map(async (item: any) => {
            const cleaner = item.last_cleaner_id ? await prisma.cleaner.findUnique({
                where: { id: item.last_cleaner_id },
                select: { name: true }
            }) : null;

            // 1. Get the active schedule version for TODAY (Brazil)
            const activeVersionForToday = await prisma.scheduleVersion.findFirst({
                where: {
                    data_viagem: { gte: start, lte: end },
                    is_active: true
                },
                select: { id: true }
            });

            // 2. Check if there is an active programming for TODAY in the ACTIVE VERSION
            const activeEvent = activeVersionForToday ? await prisma.cleaningEvent.findFirst({
                where: {
                    vehicle_id: item.vehicle_id,
                    schedule_version_id: activeVersionForToday.id,
                    status: { in: ['PREVISTO', 'EM_ANDAMENTO'] }
                },
                select: { id: true, status: true }
            }) : null;

            return {
                ...item,
                // Status "virtual" override: if there is an active event, it's EM_ANDAMENTO for UI purposes
                status: activeEvent ? 'EM_ANDAMENTO' : item.status,
                last_cleaner_name: cleaner?.name || (item.last_cleaner_id ? 'Faxineiro não identificado' : null),
                active_event_id: activeEvent?.id
            };
        }));

        return NextResponse.json({ yardItems: enrichedItems });
    } catch (error: any) {
        console.error('Yard API GET error:', error);
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Perfil de visualização apenas.' }, { status: 403 });
        }

        const { vehicle_number, status } = await request.json();

        if (!vehicle_number) {
            return NextResponse.json({ error: 'Vehicle number is required' }, { status: 400 });
        }

        // Find or create vehicle
        let vehicle = await prisma.vehicle.findUnique({
            where: { client_vehicle_number: vehicle_number.toString() }
        });

        if (!vehicle) {
            vehicle = await prisma.vehicle.create({
                data: { client_vehicle_number: vehicle_number.toString() }
            });
        }

        // Check if already in yard
        const existing = await prisma.yardInventory.findFirst({
            where: { vehicle_id: vehicle.id }
        });

        if (existing) {
            const updated = await prisma.yardInventory.update({
                where: { id: existing.id },
                data: { 
                    status: status || 'SUJO',
                    last_cleaned_at: status === 'LIMPO' ? new Date() : existing.last_cleaned_at
                },
                include: { vehicle: true }
            });
            return NextResponse.json(updated);
        }

        const yardItem = await prisma.yardInventory.create({
            data: {
                vehicle_id: vehicle.id,
                status: status || 'SUJO',
                last_cleaned_at: status === 'LIMPO' ? new Date() : null
            },
            include: {
                vehicle: true
            }
        });

        return NextResponse.json(yardItem);
    } catch (error: any) {
        console.error('Yard API POST error:', error);
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user || user.role === 'OPERATOR') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        await prisma.yardInventory.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Yard API DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { vehicle_id, status, checklist } = await request.json();

        if (!vehicle_id || !status) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { updateYardStatus } = await import('@/lib/event-service');
        const updated = await updateYardStatus(vehicle_id, status, user.id, checklist);

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error('Yard API PATCH error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
