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

        // 2. Busca eventos críticos da escala ativa
        // Regra: Apenas entre AGORA e +1 HORA (SLA preventivo)
        const criticalEvents = await prisma.cleaningEvent.findMany({
            where: {
                schedule_version_id: activeVersion.id,
                status: 'PREVISTO',
                liberar_ate_at: {
                    gte: now, // Começa a avisar apenas agora
                    lte: oneHourFromNow // Para de avisar assim que o prazo estoura
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
            console.log('[WhatsApp] Nenhum evento crítico de SLA encontrado na escala ativa.');
            return { success: true, count: 0 };
        }

        // 3. Deduplicar por número de veículo (cada alerta deve ser único)
        const uniqueVehiclesMap = new Map();

        criticalEvents.forEach(e => {
            const vehicle = (e as any).vehicle;
            const vehicleNumber = vehicle?.client_vehicle_number?.toString() || '';
            
            if (!vehicleNumber || vehicleNumber.startsWith('EMPTY_')) return;

            const currentLimit = new Date(e.liberar_ate_at);
            
            if (!uniqueVehiclesMap.has(vehicleNumber) || currentLimit < uniqueVehiclesMap.get(vehicleNumber).limit) {
                uniqueVehiclesMap.set(vehicleNumber, {
                    number: vehicleNumber,
                    limit: currentLimit
                });
            }
        });

        if (uniqueVehiclesMap.size === 0) {
            return { success: true, count: 0 };
        }

        // 4. Ordenar e Formatar
        const sortedVehicles = Array.from(uniqueVehiclesMap.values())
            .sort((a, b) => a.limit.getTime() - b.limit.getTime());

        const vehicleList = sortedVehicles.slice(0, 25).map(v => {
            const timeStr = new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
            }).format(v.limit);
            return `▪️ Carro *${v.number}* — limite às *${timeStr}*`;
        }).join('\n');

        let message = `⚠️ *ALERTA DE SLA — BUSMANAGER* ⚠️\n\n` +
            `Os veículos abaixo estão a *menos de 1 hora* do limite e a limpeza *não foi iniciada*:\n\n` +
            `${vehicleList}\n`;

        if (sortedVehicles.length > 25) {
            message += `\n... e mais *${sortedVehicles.length - 25}* veículos pendentes.`;
        }

        message += `\nFavor verificar com urgência! 🚌⏱️`;

        await sendWhatsAppMessage(message);

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

        const saida = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(event.saida_programada_at));
        
        const isYard = event.event_business_key?.startsWith('YARD-');
        const cargoLabel = isYard ? 'Faxineiro' : 'Colaborador';
        const responsavel = event.cleaner?.name || event.started_by?.name || 'Sistema';

        const message = `⏳ *LIMPEZA INICIADA*\n\n` +
            `🚌 *Carro:* ${event.vehicle.client_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saida}\n` +
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

        const saida = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(event.saida_programada_at));

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
            `🕒 *Saída Prevista:* ${saida}\n` +
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
    saida: Date
}) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    try {
        const saidaStr = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(details.saida));

        const message = `🔄 *TROCA DE VEÍCULO*\n\n` +
            `❌ *Saiu:* ${details.original_vehicle_number}\n` +
            `✅ *Entrou:* ${details.replacement_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saidaStr}\n` +
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
export async function sendWhatsAppMessage(text: string) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    try {
        await axios.post(url, {
            phone: WHATSAPP_GROUP_ID,
            message: text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': ZAPI_CLIENT_TOKEN || ''
            },
            timeout: 10000
        });
        console.log('[WhatsApp] Mensagem enviada com sucesso.');
    } catch (error: any) {
        console.error('[WhatsApp] Falha ao enviar:', error.response?.data || error.message);
        throw error;
    }
}
