const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.scheduleImport.count();
    const lastImport = await prisma.scheduleImport.findFirst({
        orderBy: { imported_at: 'desc' },
        select: { id: true, original_filename: true, status: true, records_count_raw: true, imported_at: true, error_details: true }
    });
    console.log(`Total imports: ${count}`);
    if (lastImport) {
        console.log('Last import:', JSON.stringify(lastImport, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
