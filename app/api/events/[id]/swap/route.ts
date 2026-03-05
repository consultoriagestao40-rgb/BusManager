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

        let { replacementVehicleNumber, motivo, observacao } = await request.json();

        if (!replacementVehicleNumber || !motivo) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // FIX: Map frontend reasons to backend Enum if they don't exist
        // Backend supports: QUEBRA, ONIBUS_NAO_CHEGOU_NO_HORARIO, MANUTENCAO, OUTROS
        // Frontend sends: QUEBRA, RODIZIO, RESERVA, OUTRO
        const validReasons = ['QUEBRA', 'ONIBUS_NAO_CHEGOU_NO_HORARIO', 'MANUTENCAO', 'CARRO_NAO_ESTA_NO_PATIO', 'OUTROS'];

        if (!validReasons.includes(motivo)) {
            // Append original reason to observation
            observacao = `[Motivo: ${motivo}] ${observacao || ''}`;
            // Fallback to OUTROS
            motivo = 'OUTROS';
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

        // Use centralized event service for swap logic
        const { swapVehicle } = await import('@/lib/event-service');
        await swapVehicle(id, user.id, {
            replacement_vehicle_id: replacementVehicle.id,
            motivo: motivo,
            observacao: observacao
        });

        // Fetch updated event to return
        const updatedEvent = await prisma.cleaningEvent.findUnique({
            where: { id },
            include: { vehicle: true }
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error) {
        console.error('Swap Event Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
