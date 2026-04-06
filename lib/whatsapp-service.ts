import prisma from '@/lib/prisma';
import axios from 'axios';
import { addHours, subHours, startOfDay, endOfDay } from 'date-fns';

// Credenciais da Z-API
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

/**
 * Verifica eventos em atraso (SLA de 1h) - DESATIVADO PARA ESTABILIZAÇÃO
 */
export async function checkAndSendSLAAlerts() {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) {
        console.warn('[WhatsApp] Configurações de Z-API incompletas. Abortando alertas.');
        return { success: false, reason: 'Missing configuration' };
    }

    try {
        // 0. Configuração de tempo (Fuso Brasil)
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const startOfBrazilDay = startOfDay(brazilNow);
        const endOfBrazilDay = endOfDay(brazilNow);
        
        const oneHourFromNow = addHours(now, 1);

        console.log('[SLA] Buscando escala ativa para HOJE (Brasil)...');

        // 1. Identificar a Escala ATIVA para hoje (para evitar carros fantasmas)
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: {
                    gte: startOfBrazilDay,
                    lte: endOfBrazilDay
                },
                is_active: true
            }
        });

        if (!activeVersion) {
            console.log('[WhatsApp] Nenhuma escala ativa encontrada para hoje. Pulando SLA.');
            return { success: true, count: 0 };
        }

        // 2. Busca eventos críticos da escala ativa (TUDO DE HOJE ATÉ +1 HORA)
        const criticalEvents = await prisma.cleaningEvent.findMany({
            where: {
                schedule_version_id: activeVersion.id,
                status: 'PREVISTO',
                liberar_ate_at: {
                    gte: startOfBrazilDay, // Começa do início do dia para pegar atrasos passados
                    lte: oneHourFromNow    // Pega o que vence na próxima 1 hora
                },
                NOT: {
                    event_business_key: { startsWith: 'YARD-' }
                }
            },
            include: {
                vehicle: true
            }
        });

        if (criticalEvents.length === 0) {
            console.log('[WhatsApp] Nenhum evento crítico (SLA ou Atraso) encontrado.');
            return { success: true, count: 0 };
        }

        // 3. Deduplicar e Classificar (Atraso vs Alerta)
        const overdueVehicles: any[] = [];
        const alertVehicles: any[] = [];
        const processedVehicles = new Set();

        // Ordenar por horário de limite (mais críticos primeiro)
        const sortedEvents = [...criticalEvents].sort((a, b) => 
            new Date(a.liberar_ate_at).getTime() - new Date(b.liberar_ate_at).getTime()
        );

        sortedEvents.forEach(e => {
            const vehicle = (e as any).vehicle;
            const vehicleNumber = vehicle?.client_vehicle_number?.toString() || '';
            
            if (!vehicleNumber || vehicleNumber.startsWith('EMPTY_') || processedVehicles.has(vehicleNumber)) return;

            processedVehicles.add(vehicleNumber);
            const limit = new Date(e.liberar_ate_at);
            const item = { number: vehicleNumber, limit };

            if (limit < now) {
                overdueVehicles.push(item);
            } else {
                alertVehicles.push(item);
            }
        });

        if (overdueVehicles.length === 0 && alertVehicles.length === 0) {
            return { success: true, count: 0 };
        }

        // 4. Formatar Mensagem
        let message = `🚨 *RELATÓRIO DE PENDÊNCIAS — BUSMANAGER* 🚨\n\n`;

        if (overdueVehicles.length > 0) {
            message += `🔥 *EM ATRASO (VENCIDO)*\n` +
                `Estes veículos já estouraram o horário da meta. Iniciar IMEDIATAMENTE:\n` +
                overdueVehicles.slice(0, 15).map(v => {
                    const timeStr = new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        hour: '2-digit',
                        minute: '2-digit',
                    }).format(v.limit);
                    return `▪️ Carro *${v.number}* (limite ${timeStr})`;
                }).join('\n') + `\n\n`;
        }

        if (alertVehicles.length > 0) {
            message += `⚠️ *ALERTA DE SLA (A VENCER)*\n` +
                `Veículos na janela de 1 hora. Planejar limpeza para evitar atraso:\n` +
                alertVehicles.slice(0, 15).map(v => {
                    const timeStr = new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        hour: '2-digit',
                        minute: '2-digit',
                    }).format(v.limit);
                    return `▪️ Carro *${v.number}* (limite ${timeStr})`;
                }).join('\n') + `\n\n`;
        }

        message += `Favor resolver com urgência máxima! 🚌⏱️⚖️`;

        // Envia para o grupo operacional padrão
        await sendWhatsAppMessage(message);

        // Envia também para o grupo VIP da Liderança Penha (ID Oficial da Z-API)
        await sendWhatsAppMessage(message, '120363421745459340-group');

        return { success: true, count: criticalEvents.length };
    } catch (error: any) {
        console.error('[WhatsApp] Erro ao verificar alertas de SLA:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Envia alerta de início de limpeza
 */
export async function sendStartAlert(eventId: string) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    try {
        const event = await prisma.cleaningEvent.findUnique({
            where: { id: eventId },
            include: { 
                vehicle: true,
                started_by: true,
                cleaner: true
            }
        });

        if (!event || !event.vehicle) return;

        const meta = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(event.liberar_ate_at));
        
        const isYard = event.event_business_key?.startsWith('YARD-');
        const cargoLabel = isYard ? 'Faxineiro' : 'Colaborador';
        const responsavel = event.cleaner?.name || event.started_by?.name || 'Sistema';

        const message = `⏳ *LIMPEZA INICIADA*\n\n` +
            `🚌 *Carro:* ${event.vehicle.client_vehicle_number}\n` +
            `🕒 *Meta (H-1):* ${meta}\n` +
            `👤 *${cargoLabel}:* ${responsavel}\n\n` +
            `Veículo entrou em processo de limpeza! 🚌`;

        await sendWhatsAppMessage(message);
    } catch (error) {
        console.error('[WhatsApp] Erro ao preparar alerta de início:', error);
    }
}

/**
 * Envia alerta de conclusão de limpeza
 */
export async function sendCompletionAlert(eventId: string) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    try {
        const event = await prisma.cleaningEvent.findUnique({
            where: { id: eventId },
            include: { 
                vehicle: true,
                completed_by: true,
                cleaner: true
            }
        });

        if (!event || !event.vehicle) return;

        const meta = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(event.liberar_ate_at));

        const concluido = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date());
        
        const isYard = event.event_business_key?.startsWith('YARD-');
        const cargoLabel = isYard ? 'Faxineiro' : 'Colaborador';
        const responsavel = event.cleaner?.name || event.completed_by?.name || 'Sistema';

        const message = `✅ *LIMPEZA CONCLUÍDA*\n\n` +
            `🚌 *Carro:* ${event.vehicle.client_vehicle_number}\n` +
            `🕒 *Meta (H-1):* ${meta}\n` +
            `🏁 *Concluído às:* ${concluido}\n` +
            `👤 *${cargoLabel}:* ${responsavel}\n\n` +
            `Equipe de limpeza finalizando! 🚌`;

        await sendWhatsAppMessage(message);
    } catch (error) {
        console.error('[WhatsApp] Erro ao preparar alerta de conclusão:', error);
    }
}

/**
 * Envia alerta de troca de veículo (Swap)
 */
export async function sendSwapAlert(details: {
    original_vehicle_number: string,
    replacement_vehicle_number: string,
    motivo: string,
    usuario: string,
    meta: Date // Alterado de saida para meta
}) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    try {
        const metaStr = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(details.meta));

        const message = `🔄 *TROCA DE VEÍCULO*\n\n` +
            `❌ *Saiu:* ${details.original_vehicle_number}\n` +
            `✅ *Entrou:* ${details.replacement_vehicle_number}\n` +
            `🕒 *Meta (H-1):* ${metaStr}\n` +
            `📝 *Motivo:* ${details.motivo}\n` +
            `👤 *Por:* ${details.usuario}\n\n` +
            `Escala atualizada no BusManager! 🚌`;

        await sendWhatsAppMessage(message);
    } catch (error) {
        console.error('[WhatsApp] Erro ao preparar alerta de troca:', error);
    }
}

/**
 * Função base para envio de mensagens via Z-API (EXPORTADA)
 */
export async function sendWhatsAppMessage(text: string, overridePhone?: string) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    const targetPhone = overridePhone || WHATSAPP_GROUP_ID;

    try {
        await axios.post(url, {
            phone: targetPhone,
            message: text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': ZAPI_CLIENT_TOKEN || ''
            },
            timeout: 10000
        });
        console.log(`[WhatsApp] Mensagem enviada com sucesso para ${targetPhone}.`);
    } catch (error: any) {
        console.error(`[WhatsApp] Falha ao enviar para ${targetPhone}:`, error.response?.data || error.message);
        throw error;
    }
}
