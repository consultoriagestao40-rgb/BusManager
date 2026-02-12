const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning database...');

    const deletedEvents = await prisma.cleaningEvent.deleteMany({});
    console.log(`Deleted ${deletedEvents.count} cleaning events.`);

    const deletedVersions = await prisma.scheduleVersion.deleteMany({});
    console.log(`Deleted ${deletedVersions.count} schedule versions.`);

    const deletedImports = await prisma.scheduleImport.deleteMany({});
    console.log(`Deleted ${deletedImports.count} imports.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
