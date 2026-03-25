
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Iniciando correção histórica do flag at_yard...');

    const updated = await prisma.cleaningEvent.updateMany({
        where: {
            status: { in: ['EM_ANDAMENTO', 'CONCLUIDO'] },
            at_yard: false
        },
        data: {
            at_yard: true
        }
    });

    console.log(`✅ Correção concluída! Foram atualizados ${updated.count} registros.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
