
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const events = await prisma.cleaningEvent.findMany({
        where: { status: 'CONCLUIDO' },
        take: 5,
        select: {
            id: true,
            status: true,
            data_viagem: true,
            started_at: true,
            finished_at: true,
            cleaner_id: true,
            cleaner: true
        }
    });

    console.log('Completed Events Sample:', JSON.stringify(events, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
