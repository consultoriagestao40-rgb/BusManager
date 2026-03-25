
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Iniciando limpeza de duplicatas de eventos de pátio (YARD)...');

    // 1. Buscar todos os eventos de pátio
    const yardEvents = await prisma.cleaningEvent.findMany({
        where: {
            event_business_key: { startsWith: 'YARD-' }
        },
        orderBy: {
            finished_at: 'desc'
        }
    });

    console.log(`Encontrados ${yardEvents.length} eventos de pátio no total.`);

    // 2. Agrupar por veículo e versão da escala
    const groups: Record<string, typeof yardEvents> = {};
    for (const event of yardEvents) {
        const key = `${event.vehicle_id}-${event.schedule_version_id}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(event);
    }

    const groupsWithDuplicates = Object.values(groups).filter(g => g.length > 1);
    console.log(`Identificados ${groupsWithDuplicates.length} grupos com duplicatas.`);

    let deletedCount = 0;

    // 3. Processar cada grupo
    for (const group of groupsWithDuplicates) {
        // O primeiro item (índice 0) é o mais recente devido ao orderBy finished_at desc
        const [keep, ...toDelete] = group;
        
        console.log(`Consolidando veículo ${keep.vehicle_id} na versão ${keep.schedule_version_id}: mantendo ${keep.id}, removendo ${toDelete.length} duplicatas.`);

        for (const event of toDelete) {
            await prisma.cleaningEvent.delete({
                where: { id: event.id }
            });
            deletedCount++;
        }
    }

    console.log(`✅ Limpeza concluída! Total de registros removidos: ${deletedCount}`);
}

main()
    .catch(e => {
        console.error('❌ Erro durante a limpeza:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
