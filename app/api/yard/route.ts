import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

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
                vehicle: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        return NextResponse.json({ yardItems });
    } catch (error: any) {
        console.error('Yard API GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
                data: { status: status || 'SUJO' },
                include: { vehicle: true }
            });
            return NextResponse.json(updated);
        }

        const yardItem = await prisma.yardInventory.create({
            data: {
                vehicle_id: vehicle.id,
                status: status || 'SUJO'
            },
            include: {
                vehicle: true
            }
        });

        return NextResponse.json(yardItem);
    } catch (error: any) {
        console.error('Yard API POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
