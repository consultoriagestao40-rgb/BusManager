import prisma from '../lib/prisma';
import { startOfDay, endOfDay, subDays, format, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Função de teste para gerar o relatório consolidado do dia anterior
 */
async function generateDailyReport(targetDate: Date = subDays(new Date(), 1)) {
    const start = startOfDay(targetDate);
    const end = endOfDay(targetDate);
    const dateStr = format(targetDate, 'dd/MM/yyyy', { locale: ptBR });

    console.log(`📊 Iniciando relatório para o dia: ${dateStr}`);

    // 1. Identificar a Escala ATIVA para o dia do relatório
    const activeVersion = await prisma.scheduleVersion.findFirst({
        where: {
            data_viagem: {
                gte: start,
                lte: end
            },
            is_active: true
        }
    });

    if (!activeVersion) {
        console.log(`📊 Nenhuma escala ativa encontrada para o dia: ${dateStr}`);
        return;
    }

    // 2. Total Programado (Apenas da escala ATIVA, ignorando eventos extras de pátio)
    const totalScheduled = await prisma.cleaningEvent.count({
        where: {
            schedule_version_id: activeVersion.id,
            data_viagem: {
                gte: start,
                lte: end
            },
            NOT: {
                event_business_key: { startsWith: 'YARD-' }
            }
        }
    });

    // 3. Total Executado na Escala (Finalizados e que pertencem à escala ativa)
    const executedEvents = await prisma.cleaningEvent.findMany({
        where: {
            schedule_version_id: activeVersion.id,
            status: 'CONCLUIDO'
        },
        include: {
            cleaner: true
        }
    });

    // Separar escala principal vs pátio
    const escalaExecutedEvents = executedEvents.filter(e => !(e.event_business_key || '').startsWith('YARD-'));
    const yardExecutedEvents = executedEvents.filter(e => (e.event_business_key || '').startsWith('YARD-'));

    // 4. Limpezas de Pátio (Lógica de "Virtual Override" igual ao Dashboard KPI)
    const yardItems = await prisma.yardInventory.findMany({
        where: { status: 'LIMPO' }
    });

    const activeVehicleIds = new Set(escalaExecutedEvents.map(e => e.vehicle_id));
    const cleaners = await prisma.cleaner.findMany();
    const cleanerMapById = new Map(cleaners.map(c => [c.id, c.name]));
    
    const validYardCleanings = yardItems.filter(item => {
        const cleanDate = item.last_cleaned_at || item.updated_at;
        if (!cleanDate) return false;
        
        // Normalize to Brazil Time (-3)
        const brazilDate = new Date(new Date(cleanDate).getTime() - 3 * 60 * 60 * 1000);
        
        if (brazilDate < start || brazilDate > end) return false;
        if (activeVehicleIds.has(item.vehicle_id)) return false;
        return true;
    });

    // Unificar eventos de pátio históricos e itens do pátio atualmente limpos
    const uniqueYardCleanings = new Map<string, { vehicle_id: string; cleanerName: string; duration: number }>();

    yardExecutedEvents.forEach(e => {
        uniqueYardCleanings.set(e.vehicle_id, {
            vehicle_id: e.vehicle_id,
            cleanerName: e.cleaner?.name || 'Sistema',
            duration: e.started_at && e.finished_at ? differenceInMinutes(new Date(e.finished_at), new Date(e.started_at)) : 0
        });
    });

    validYardCleanings.forEach(item => {
        if (!uniqueYardCleanings.has(item.vehicle_id)) {
            const name = item.last_cleaner_id ? (cleanerMapById.get(item.last_cleaner_id) || 'Não Identificado') : 'Sistema';
            const duration = item.updated_at && item.last_cleaned_at ? differenceInMinutes(new Date(item.last_cleaned_at), new Date(item.updated_at)) : 0;
            uniqueYardCleanings.set(item.vehicle_id, {
                vehicle_id: item.vehicle_id,
                cleanerName: name,
                duration: duration
            });
        }
    });

    const finalYardCleanings = Array.from(uniqueYardCleanings.values());
    const yardCleanedCount = finalYardCleanings.length;

    // 5. Consolidação de Dados
    const totalExecuted = escalaExecutedEvents.length + yardCleanedCount;

    // 6. Atrasos (Usa 'liberar_ate_at' que é a Meta H-1)
    const delayedCount = escalaExecutedEvents.filter(e => {
        if (!e.finished_at || !e.liberar_ate_at) return false;
        return new Date(e.finished_at) > new Date(e.liberar_ate_at);
    }).length;

    // 7. Tempo Médio (Escala + Pátio)
    let totalMinutes = 0;
    let countDuration = 0;

    escalaExecutedEvents.forEach(e => {
        if (e.started_at && e.finished_at) {
            const duration = differenceInMinutes(new Date(e.finished_at), new Date(e.started_at));
            if (duration > 0 && duration < 600) {
                totalMinutes += duration;
                countDuration++;
            }
        }
    });

    finalYardCleanings.forEach(item => {
        if (item.duration > 0 && item.duration < 600) {
            totalMinutes += item.duration;
            countDuration++;
        }
    });

    const avgTime = countDuration > 0 ? Math.round(totalMinutes / countDuration) : 0;

    // 8. Ranking de Produtividade Unificado
    const ranking: Record<string, number> = {};
    
    escalaExecutedEvents.forEach(e => {
        const name = e.cleaner?.name || 'Sistema';
        ranking[name] = (ranking[name] || 0) + 1;
    });

    finalYardCleanings.forEach(item => {
        const name = item.cleanerName;
        ranking[name] = (ranking[name] || 0) + 1;
    });

    const sortedRanking = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // 9. Trocas
    const totalSwaps = await prisma.swap.count({
        where: {
            original_event: {
                schedule_version_id: activeVersion.id
            }
        }
    });

    // 10. Cancelados
    const cancelledCount = await prisma.cleaningEvent.count({
        where: {
            schedule_version_id: activeVersion.id,
            status: 'CANCELADO',
            data_viagem: {
                gte: start,
                lte: end
            },
            NOT: {
                event_business_key: { startsWith: 'YARD-' }
            }
        }
    });

    const effectiveScheduled = totalScheduled - cancelledCount;

    // Montagem da Mensagem
    const message = `📊 *FECHAMENTO DIÁRIO — BUSMANAGER* 📊\n` +
        `📅 *Referente a:* ${dateStr}\n\n` +
        `✅ *Limpezas Realizadas:* ${totalExecuted} / ${effectiveScheduled} (${effectiveScheduled > 0 ? Math.round((totalExecuted/effectiveScheduled)*100) : 0}%)\n` +
        `   ▪️ Escala: ${escalaExecutedEvents.length} carro(s)\n` +
        `   ▪️ Pátio: ${yardCleanedCount} carro(s)\n\n` +
        `⏱️ *Tempo Médio:* ${avgTime} min por veículo\n` +
        `⚠️ *Saídas com Atraso:* ${delayedCount}\n` +
        `❌ *Cancelados:* ${cancelledCount}\n` +
        `🔄 *Trocas na Escala:* ${totalSwaps}\n` +
        `🛢️ *Limpezas de Pátio:* ${yardCleanedCount}\n\n` +
        `👤 *Produtividade por Equipe (Top 5):*\n` +
        (sortedRanking.length > 0 
            ? sortedRanking.map(([name, count]) => `▪️ ${name}: ${count} carro(s)`).join('\n')
            : '▪️ Nenhuma limpeza registrada.') +
        `\n\n_Relatório gerado automaticamente pelo BusManager_ 🚌`;

    console.log('\n--- MENSAGEM FINAL ---');
    console.log(message);
    
    return message;
}

// Executa com a data de hoje para o preview se não houver dados de ontem
generateDailyReport(new Date()).catch(console.error);
