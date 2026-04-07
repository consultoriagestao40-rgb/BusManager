import prisma from './prisma';
import { startOfDay, endOfDay, subDays, differenceInMinutes, subHours, format } from 'date-fns';
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

    // 4. Limpezas de Pátio (Lógica de "Virtual Override" igual ao Dashboard KPI)
    const yardItems = await prisma.yardInventory.findMany({
        where: { status: 'LIMPO' }
    });

    const activeVehicleIds = new Set(executedEvents.map(e => e.vehicle_id));
    const cleaners = await prisma.cleaner.findMany();
    const cleanerMapById = new Map(cleaners.map(c => [c.id, c.name]));
    
    const validYardCleanings = yardItems.filter(item => {
        const cleanDate = item.last_cleaned_at || item.updated_at;
        if (!cleanDate) return false;
        
        // Normalize to Brazil Time (-3) to match Dashboard card logic
        const brazilDate = subHours(new Date(cleanDate), 3);
        
        // Check if falls within the report day
        if (brazilDate < start || brazilDate > end) return false;

        // Skip if there's an active scale event for this vehicle (Avoid double counting)
        if (activeVehicleIds.has(item.vehicle_id)) return false;

        return true;
    });

    // 5. Consolidação de Dados
    const totalExecuted = executedEvents.length + validYardCleanings.length;

    // 6. Atrasos (Usa 'liberar_ate_at' que é a Meta H-1, igual ao Dashboard)
    const delayedCount = executedEvents.filter(e => {
        if (!e.finished_at || !e.liberar_ate_at) return false;
        return new Date(e.finished_at) > new Date(e.liberar_ate_at);
    }).length;

    // 7. Tempo Médio (Escala + Pátio)
    let totalMinutes = 0;
    let countDuration = 0;

    // Tempos da Escala
    executedEvents.forEach(e => {
        if (e.started_at && e.finished_at) {
            const duration = differenceInMinutes(new Date(e.finished_at), new Date(e.started_at));
            if (duration > 0 && duration < 600) { // Filtro de outliers
                totalMinutes += duration;
                countDuration++;
            }
        }
    });

    // Tempos do Pátio
    validYardCleanings.forEach(item => {
        if (item.updated_at && item.last_cleaned_at) {
            const duration = differenceInMinutes(new Date(item.last_cleaned_at), new Date(item.updated_at));
            if (duration > 0 && duration < 600) {
                totalMinutes += duration;
                countDuration++;
            }
        }
    });

    const avgTime = countDuration > 0 ? Math.round(totalMinutes / countDuration) : 0;

    // 8. Ranking de Produtividade Unificado
    const ranking: Record<string, number> = {};
    
    // Produtividade Escala
    executedEvents.forEach(e => {
        const name = e.cleaner?.name || 'Sistema';
        ranking[name] = (ranking[name] || 0) + 1;
    });

    // Produtividade Pátio
    validYardCleanings.forEach(item => {
        const name = item.last_cleaner_id ? (cleanerMapById.get(item.last_cleaner_id) || 'Não Identificado') : 'Sistema';
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

    // 10. Pátio (Quantidade oficial calculada no passo 4)
    const yardCleanedCount = validYardCleanings.length;

    // 10. Lógica de Programados (Total Real = Total Bruto - Cancelados)
    const effectiveScheduled = totalScheduled - cancelledCount;

    // Mensagem
    const message = `📊 *FECHAMENTO DIÁRIO — BUSMANAGER* 📊\n` +
        `📅 *Referente a:* ${dateStr}\n\n` +
        `✅ *Limpezas Realizadas:* ${totalExecuted} / ${effectiveScheduled} (${effectiveScheduled > 0 ? Math.round((totalExecuted/effectiveScheduled)*100) : 0}%)\n` +
        `⏱️ *Tempo Médio:* ${avgTime} min por veículo\n` +
        `⚠️ *Saídas com Atraso:* ${delayedCount}\n` +
        `❌ *Cancelados:* ${cancelledCount}\n` +
        `🔄 *Trocas na Escala:* ${totalSwaps}\n` +
        `🛢️ *Limpezas de Pátio:* ${yardCleanedCount}\n\n` +
        `👤 *Produtividade por Equipe (Top 5):*\n` +
        (sortedRanking.length > 0 
            ? sortedRanking.map(([name, count]) => `▪️ ${name}: ${count} carro(s)`).join('\n')
            : '▪️ Nenhuma limpeza registrada.') +
        `\n\n_Relatório gerado automaticamente às 08:00_ 🚌`;

    // 11. Envia para o grupo operacional padrão
    await sendWhatsAppMessage(message);

    // 12. Envia também para o grupo VIP (Liderança Penha)
    await sendWhatsAppMessage(message, '120363421745459340-group');
    
    return { success: true, date: dateStr, scheduled: effectiveScheduled, executed: totalExecuted };
}

