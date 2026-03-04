import { PrismaClient } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

const prisma = new PrismaClient();

async function recoverSwaps() {
    console.log('--- Iniciando Recuperação de Trocas ---');

    // Data de hoje (conforme contexto do usuário)
    const today = new Date('2026-03-04');
    const start = startOfDay(today);
    const end = endOfDay(today);

    try {
        // 1. Encontrar a versão ATIVA de hoje
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            console.error('Nenhuma versão ativa encontrada para hoje.');
            return;
        }

        console.log(`Versão ativa encontrada: ${activeVersion.id} (V${activeVersion.version_number})`);

        // 2. Mapear eventos ativos pela business key
        const activeEvents = await prisma.cleaningEvent.findMany({
            where: { schedule_version_id: activeVersion.id }
        });
        const activeEventsMap = new Map(activeEvents.map(e => [e.event_business_key, e.id]));

        // 3. Encontrar todas as trocas de hoje que estão em versões INATIVAS
        const lostSwaps = await prisma.swap.findMany({
            where: {
                original_event: {
                    data_viagem: { gte: start, lte: end },
                    schedule_version_id: { not: activeVersion.id }
                }
            },
            include: {
                original_event: true
            }
        });

        console.log(`Encontradas ${lostSwaps.length} trocas em versões inativas.`);

        let migratedCount = 0;

        // 4. Migrar cada troca
        for (const swap of lostSwaps) {
            const businessKey = swap.original_event.event_business_key;
            const newEventId = activeEventsMap.get(businessKey);

            if (newEventId) {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { original_event_id: newEventId }
                });
                console.log(`Troca ${swap.id} migrada para novo evento ${newEventId} (Key: ${businessKey})`);
                migratedCount++;
            } else {
                console.warn(`Não foi possível encontrar o evento correspondente para a chave ${businessKey} na versão ativa.`);
            }
        }

        console.log(`--- Recuperação concluída: ${migratedCount} trocas migradas ---`);

    } catch (error) {
        console.error('Erro durante a recuperação:', error);
    } finally {
        await prisma.$disconnect();
    }
}

recoverSwaps();
