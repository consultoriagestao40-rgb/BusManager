import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
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

        console.log(`Found ${versions.length} versions for today.`);

        for (const ver of versions) {
            console.log(`\nVersion #${ver.version_number} (Active: ${ver.is_active}, Created: ${ver.created_at.toISOString()}):`);
            const targetCars = ver.events.filter(e => 
                ['5588', '65200', '5591'].includes(e.vehicle?.client_vehicle_number || '')
            );

            console.log(`Events for 5588, 65200, 5591 count: ${targetCars.length}`);
            for (const e of targetCars) {
                console.log(` - ID: ${e.id}`);
                console.log(`   Car: ${e.vehicle?.client_vehicle_number}`);
                console.log(`   Time: ${e.hora_viagem.toISOString()}`);
                console.log(`   Status: ${e.status}`);
                console.log(`   Business Key: ${e.event_business_key}`);
                console.log(`   Swaps count: ${e.swaps.length}`);
                if (e.swaps.length > 0) {
                    console.log(`   Swaps: ${JSON.stringify(e.swaps)}`);
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
