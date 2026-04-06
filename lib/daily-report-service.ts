import prisma from './prisma';
import { startOfDay, endOfDay, subDays, differenceInMinutes } from 'date-fns';
import { sendWhatsAppMessage } from './whatsapp-service';

/**
 * Gera o relatório consolidado do dia anterior e envia via WhatsApp
 */
export async function sendDailySummaryReport(targetDate: Date = subDays(new Date(), 1)) {
    // Ajuste para o fuso de Brasília (00:00:00 às 23:59:59)
    // No servidor Vercel (UTC), subtraímos 3 horas para alinhar com o dia do Brasil
    const start = startOfDay(targetDate);
    const end = endOfDay(targetDate);

    const dateStr = new Intl.DateTimeFormat('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(targetDate);

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
        console.log(`[WhatsApp] Nenhuma escala ativa encontrada para ${dateStr}. Relatório abortado.`);
        return { success: false, reason: 'No active schedule found' };
    }

    // 2. Total Programado (Apenas da escala ATIVA)
    const totalScheduled = await prisma.cleaningEvent.count({
        where: {
            schedule_version_id: activeVersion.id,
            data_viagem: {
                gte: start,
                lte: end
            }
        }
    });

    // 3. Total Executado (Finalizados dentro do dia alvo E que pertencem à escala ativa)
    const executedEvents = await prisma.cleaningEvent.findMany({
        where: {
            schedule_version_id: activeVersion.id,
            status: 'CONCLUIDO',
            finished_at: {
                gte: start,
                lte: end
            }
        },
        include: {
            cleaner: true
        }
    });

    const totalExecuted = executedEvents.length;

    // 4. Atrasos (Término > Saída Programada)
    const delayedCount = executedEvents.filter(e => {
        if (!e.finished_at || !e.saida_programada_at) return false;
        return e.finished_at > e.saida_programada_at;
    }).length;

    // 5. Tempo Médio
    let totalMinutes = 0;
    let eventsWithTime = 0;
    executedEvents.forEach(e => {
        if (e.started_at && e.finished_at) {
            totalMinutes += differenceInMinutes(e.finished_at, e.started_at);
            eventsWithTime++;
        }
    });
    const avgTime = eventsWithTime > 0 ? Math.round(totalMinutes / eventsWithTime) : 0;

    // 6. Ranking
    const ranking: Record<string, number> = {};
    executedEvents.forEach(e => {
        const name = e.cleaner?.name || 'Sistema';
        ranking[name] = (ranking[name] || 0) + 1;
    });

    const sortedRanking = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5

    // 7. Trocas (Apenas da escala ativa)
    const totalSwaps = await prisma.swap.count({
        where: {
            original_event: {
                schedule_version_id: activeVersion.id
            },
            created_at: {
                gte: start,
                lte: end
            }
        }
    });

    // 8. Cancelados (Apenas da escala ativa)
    const cancelledCount = await prisma.cleaningEvent.count({
        where: {
            schedule_version_id: activeVersion.id,
            status: 'CANCELADO',
            data_viagem: {
                gte: start,
                lte: end
            }
        }
    });

    // 9. Pátio
    const yardCleaned = executedEvents.filter(e => e.event_business_key?.startsWith('YARD-')).length;

    // Mensagem
    const message = `📊 *FECHAMENTO DIÁRIO — BUSMANAGER* 📊\n` +
        `📅 *Referente a:* ${dateStr}\n\n` +
        `✅ *Limpezas Realizadas:* ${totalExecuted} / ${totalScheduled} (${totalScheduled > 0 ? Math.round((totalExecuted/totalScheduled)*100) : 0}%)\n` +
        `⏱️ *Tempo Médio:* ${avgTime} min por veículo\n` +
        `⚠️ *Saídas com Atraso:* ${delayedCount}\n` +
        `❌ *Cancelados:* ${cancelledCount}\n` +
        `🔄 *Trocas na Escala:* ${totalSwaps}\n` +
        `🛢️ *Limpezas de Pátio:* ${yardCleaned}\n\n` +
        `👤 *Produtividade por Equipe (Top 5):*\n` +
        (sortedRanking.length > 0 
            ? sortedRanking.map(([name, count]) => `▪️ ${name}: ${count} carro(s)`).join('\n')
            : '▪️ Nenhuma limpeza registrada.') +
        `\n\n_Relatório gerado automaticamente às 08:00_ 🚌`;

    await sendWhatsAppMessage(message);
    
    return { success: true, date: dateStr, scheduled: totalScheduled, executed: totalExecuted };
}
