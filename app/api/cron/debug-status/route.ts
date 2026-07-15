import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        console.log('Querying database for events of interest on 2026-07-15...');

        // Query versions
        const versions = await prisma.scheduleVersion.findMany({
            where: {
                data_viagem: new Date('2026-07-15T00:00:00.000Z')
            },
            include: {
                events: {
                    include: {
                        vehicle: true,
                        swaps: true
                    }
                }
            },
            orderBy: { version_number: 'desc' }
        });

        const result: any[] = [];

        for (const ver of versions) {
            const verData: any = {
                version_number: ver.version_number,
                is_active: ver.is_active,
                created_at: ver.created_at,
                events: []
            };

            const targetCars = ver.events.filter(e => 
                ['5588', '65200', '5591'].includes(e.vehicle?.client_vehicle_number || '')
            );

            for (const e of targetCars) {
                verData.events.push({
                    id: e.id,
                    car: e.vehicle?.client_vehicle_number,
                    hora_viagem: e.hora_viagem,
                    status: e.status,
                    event_business_key: e.event_business_key,
                    swaps_count: e.swaps.length,
                    swaps: e.swaps
                });
            }

            result.push(verData);
        }

        return NextResponse.json({ success: true, versions: result });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
