import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { replacementVehicleNumber, motivo, observacao } = await request.json();

        if (!replacementVehicleNumber || !motivo) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const event = await prisma.cleaningEvent.findUnique({
            where: { id },
            include: { vehicle: true }
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Find or create replacement vehicle
        // Assuming we look up by client_vehicle_number
        let replacementVehicle = await prisma.vehicle.findUnique({
            where: { client_vehicle_number: replacementVehicleNumber }
        });

        if (!replacementVehicle) {
            // Create if it doesn't exist? Or require it to exist?
            // Usually swap implies a known vehicle. Let's create it on fly if needed for MVP.
            replacementVehicle = await prisma.vehicle.create({
                data: { client_vehicle_number: replacementVehicleNumber }
            });
        }

        // Create Swap Record
        const swap = await prisma.swap.create({
            data: {
                original_event_id: id,
                original_vehicle_id: event.vehicle_id,
                replacement_vehicle_id: replacementVehicle.id,
                motivo: motivo,
                observacao: observacao,
                created_by_user_id: user.id
            }
        });

        // Update Event with new Vehicle
        const updatedEvent = await prisma.cleaningEvent.update({
            where: { id },
            data: {
                vehicle_id: replacementVehicle.id
            }
        });

        return NextResponse.json({ event: updatedEvent, swap });

    } catch (error) {
        console.error('Swap Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
