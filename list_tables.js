const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Buscando tabelas...');
    try {
        const res = await prisma.$queryRaw`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `;
        console.log('Tabelas:', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error('Erro ao buscar tabelas:', e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
