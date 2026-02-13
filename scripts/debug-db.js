
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const vehicle = await prisma.vehicle.findUnique({
        where: { client_vehicle_number: '61150' },
        include: {
            events: {
                orderBy: { data_viagem: 'desc' },
                take: 5
            }
        }
    });

    if (!vehicle) {
        console.log('Vehicle 61150 not found');
        return;
    }

    console.log(`Vehicle ID: ${vehicle.id}`);
    for (const event of vehicle.events) {
        console.log('--- Event ---');
        console.log(`ID: ${event.id}`);
        console.log(`Data Viagem: ${event.data_viagem}`);
        console.log(`Hora Viagem (DB Value): ${event.hora_viagem.toISOString()}`);
        console.log(`Saida Programada (DB Value): ${event.saida_programada_at.toISOString()}`);
        console.log(`Status: ${event.status}`);
        console.log(`Schedule Version ID: ${event.schedule_version_id}`);
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
