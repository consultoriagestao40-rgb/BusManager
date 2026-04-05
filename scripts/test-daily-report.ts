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

    // 1. Total Programado (Todos os eventos com data_viagem no dia alvo)
    const totalScheduled = await prisma.cleaningEvent.count({
        where: {
            data_viagem: {
                gte: start,
                lte: end
            }
        }
    });

    // 2. Total Executado (Concluídos no dia alvo)
    const executedEvents = await prisma.cleaningEvent.findMany({
        where: {
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

    // 3. Atrasos (Término > Saída Programada)
    const delayedEvents = executedEvents.filter(e => {
        if (!e.finished_at || !e.saida_programada_at) return false;
        return e.finished_at > e.saida_programada_at;
    });

    // 4. Tempo Médio de Execução (em minutos)
    let totalMinutes = 0;
    let eventsWithTime = 0;
    executedEvents.forEach(e => {
        if (e.started_at && e.finished_at) {
            totalMinutes += differenceInMinutes(e.finished_at, e.started_at);
            eventsWithTime++;
        }
    });
    const avgTime = eventsWithTime > 0 ? Math.round(totalMinutes / eventsWithTime) : 0;

    // 5. Ranking por Colaborador
    const ranking: Record<string, number> = {};
    executedEvents.forEach(e => {
        const name = e.cleaner?.name || 'Não Informado';
        ranking[name] = (ranking[name] || 0) + 1;
    });

    const sortedRanking = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1]);

    // 6. Trocas (Swaps realizados no dia)
    const totalSwaps = await prisma.swap.count({
        where: {
            created_at: {
                gte: start,
                lte: end
            }
        }
    });

    // 7. Limpezas de Pátio (YARD-)
    const yardCleaned = executedEvents.filter(e => e.event_business_key?.startsWith('YARD-')).length;

    // Montagem da Mensagem
    const message = `📊 *FECHAMENTO DIÁRIO — BUSMANAGER* 📊\n` +
        `📅 *Referente a:* ${dateStr}\n\n` +
        `✅ *Limpezas Realizadas:* ${totalExecuted} / ${totalScheduled} (${totalScheduled > 0 ? Math.round((totalExecuted/totalScheduled)*100) : 0}%)\n` +
        `⏱️ *Tempo Médio:* ${avgTime} min por veículo\n` +
        `⚠️ *Saídas com Atraso:* ${delayedEvents.length}\n` +
        `🔄 *Trocas na Escala:* ${totalSwaps}\n` +
        `🛢️ *Limpezas de Pátio:* ${yardCleaned}\n\n` +
        `👤 *Produtividade por Equipe:*\n` +
        sortedRanking.map(([name, count]) => `▪️ ${name}: ${count} carro(s)`).join('\n') +
        `\n\n_Relatório gerado automaticamente pelo BusManager_ 🚌`;

    console.log('\n--- MENSAGEM FINAL ---');
    console.log(message);
    
    return message;
}

// Executa com a data de hoje para o preview se não houver dados de ontem
generateDailyReport(new Date()).catch(console.error);
