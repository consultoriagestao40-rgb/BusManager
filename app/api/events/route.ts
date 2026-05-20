import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { parseISO, startOfDay, endOfDay, subHours, addHours, differenceInMinutes } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Default to today if no date provided.
        // FIX: Server is UTC. Brazil is UTC-3.
        // If it's 22:00 BRT, it's 01:00 UTC Next Day.
        // We want "Today" to be relative to Brazil (UTC-3).
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const targetDate = dateParam ? parseISO(dateParam) : brazilNow;

        // Prisma SQLite date handling can be tricky.
        // We use range for safety to cover the "day".
        // Reverting to standard UTC day range to ensure stability.
        // We will deal with late-night events later.
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 1. Get the active schedule version for this date
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            // Sem escala ativa (ex: feriado) — busca apenas eventos manuais do dia
            const manualEvents = await prisma.cleaningEvent.findMany({
                where: {
                    event_business_key: { startsWith: 'MANUAL-SCHEDULE-' },
                    data_viagem: { gte: start, lte: end },
                    status: { not: 'CANCELADO' }
                },
                include: {
                    vehicle: true,
                    cleaner: true,
                    swaps: {
                        include: { replacement_vehicle: true, original_vehicle: true }
                    }
                },
                orderBy: { hora_viagem: 'asc' }
            });
            return NextResponse.json({ events: manualEvents });
        }

        // 2. Get events for the active version PLUS any manual events of the day
        //    (manual events may belong to an older version if a new import happened after insertion)
        const events = await prisma.cleaningEvent.findMany({
            where: {
                OR: [
                    // Events from the current active version (normal schedule)
                    {
                        schedule_version_id: activeVersion.id,
                        NOT: { event_business_key: { startsWith: 'YARD-' } }
                    },
                    // Manual events inserted for today — always show regardless of version
                    {
                        event_business_key: { startsWith: 'MANUAL-SCHEDULE-' },
                        data_viagem: { gte: start, lte: end },
                        status: { not: 'CANCELADO' }
                    }
                ]
            },
            include: {
                vehicle: true,
                cleaner: true,
                swaps: {
                    include: {
                        replacement_vehicle: true,
                        original_vehicle: true
                    }
                }
            },
            orderBy: { hora_viagem: 'asc' }
        });

        // 3. Get swaps specifically for THIS active version
        const allSwapsToday = await prisma.swap.findMany({
            where: {
                original_event: { schedule_version_id: activeVersion.id }
            },
            include: {
                replacement_vehicle: true,
                original_vehicle: true,
                original_event: { select: { event_business_key: true } }
            }
        });

        // 3. Get current yard inventory to sync flags
        const currentYardIds = (await prisma.yardInventory.findMany({ select: { vehicle_id: true } })).map(y => y.vehicle_id);

        // 4. Ensure all swaps are represented in the active events
        // If a swap is linked to an event that is now inactive, we find its active counterpart
        const eventsWithAllSwaps = events.map(event => {
            // Rule: Started or Finished events are ALWAYS at_yard by business rule
            const isStartedOrFinished = event.status === 'EM_ANDAMENTO' || event.status === 'CONCLUIDO';
            
            // Rule: If vehicle is in yard inventory, it's considered at_yard for the scale checkbox
            const autoAtYard = currentYardIds.includes(event.vehicle_id);
            
            let enrichedEvent = { 
                ...event, 
                at_yard: event.at_yard || autoAtYard || isStartedOrFinished
            };

            try {
                const extraSwaps = allSwapsToday.filter(s =>
                    s.original_event?.event_business_key === enrichedEvent.event_business_key &&
                    !(enrichedEvent.swaps || []).some((existing: any) => existing.id === s.id)
                );

                if (extraSwaps.length > 0) {
                    enrichedEvent.swaps = [...(enrichedEvent.swaps || []), ...extraSwaps];
                }
            } catch (e) {
                console.error('Error merging swaps for event:', enrichedEvent.id, e);
            }
            return enrichedEvent;
        });

        // 5. Check and trigger WhatsApp alerts for Critical Yard (no at_yard and <= 90 minutes remaining)
        try {
            const nowTime = new Date();
            const criticalYardEvents = eventsWithAllSwaps.filter((event: any) => {
                // Rule: status is 'PREVISTO', not at_yard
                if (event.status !== 'PREVISTO' || event.at_yard) return false;
                
                // Calculate time difference in minutes
                const limitDate = new Date(event.liberar_ate_at);
                const diff = differenceInMinutes(limitDate, nowTime);
                
                // Active alerts: when difference is <= 90 minutes (1h30m)
                // And whatsapp_yard_alert_sent is false (to prevent duplicates)
                return diff <= 90 && !event.whatsapp_yard_alert_sent;
            });

            if (criticalYardEvents.length > 0) {
                const { sendWhatsAppMessage } = await import('@/lib/whatsapp-service');
                for (const criticalEvent of criticalYardEvents) {
                    const vehicleNumber = criticalEvent.vehicle?.client_vehicle_number || '';
                    
                    const text = `🚨 *ALERTA URGENTE: CARRO AUSENTE NO PÁTIO* 🚨\n\n` +
                        `🚌 *Carro:* ${vehicleNumber}\n` +
                        `🕒 *Meta de Liberação (H-1):* ${new Intl.DateTimeFormat('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                            hour: '2-digit',
                            minute: '2-digit'
                        }).format(new Date(criticalEvent.liberar_ate_at))}\n\n` +
                        `⚠️ *Atenção:* Falta menos de *30 minutos* para iniciar a limpeza planejada deste veículo e ele ainda *NÃO foi confirmado no pátio*!\n\n` +
                        `Por favor, confirme a presença do veículo no pátio ou realize a substituição (Troca) no BusManager para liberar a operação.`;

                    try {
                        // Envia para o grupo operacional padrão
                        await sendWhatsAppMessage(text);
                        // Envia também para o grupo VIP da Liderança Penha
                        await sendWhatsAppMessage(text, '120363421745459340-group');

                        // Atualiza no banco de dados para marcar como enviado
                        await prisma.cleaningEvent.update({
                            where: { id: criticalEvent.id },
                            data: { whatsapp_yard_alert_sent: true }
                        });
                        
                        // Atualiza na resposta em memória também
                        criticalEvent.whatsapp_yard_alert_sent = true;
                        
                        console.log(`[Yard Alert] WhatsApp enviado com sucesso para o carro ${vehicleNumber}.`);
                    } catch (err) {
                        console.error(`[Yard Alert] Erro ao enviar WhatsApp para ${vehicleNumber}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error('[Yard Alert] Erro no fluxo de monitoramento de pátio crítico:', err);
        }

        return NextResponse.json({ events: eventsWithAllSwaps });


    } catch (error: any) {
        console.error('Events API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}
