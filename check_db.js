
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.cleaningEvent.count();
    console.log(`Total events: ${count}`);

    const lastEvents = await prisma.cleaningEvent.findMany({
        take: 5,
        orderBy: { data_viagem: 'desc' },
        select: { data_viagem: true, status: true }
    });

    console.log('Latest 5 events:', lastEvents);

    const firstEvents = await prisma.cleaningEvent.findMany({
        take: 5,
        orderBy: { data_viagem: 'asc' },
        select: { data_viagem: true, status: true }
    });

    console.log('Earliest 5 events:', firstEvents);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
