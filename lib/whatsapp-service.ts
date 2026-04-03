import prisma from './prisma';
import axios from 'axios';
import { addHours, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Credenciais da Z-API
// Obtenha em: https://app.z-api.io -> Sua instância -> Credenciais
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN; // Token de segurança do client
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID; // Ex: "120363XXXXXXXXX@g.us"

/**
 * Verifica eventos em atraso (SLA de 1h) e envia alerta consolidado
 */
export async function checkAndSendSLAAlerts() {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) {
        console.warn('[WhatsApp] Configurações de Z-API incompletas. Abortando alertas.');
        return { success: false, reason: 'Missing configuration' };
    }

    try {
        const now = new Date();
        const oneHourFromNow = addHours(now, 1);

        // Busca eventos onde:
        // 1. Status é PREVISTO (limpeza não iniciada)
        // 2. Saída programada em menos de 1 hora
        // 3. Ainda não foi notificado via WhatsApp
        // 4. Não tem troca registrada
        const criticalEvents = await prisma.cleaningEvent.findMany({
            where: {
                status: 'PREVISTO',
                saida_programada_at: {
                    gt: now,
                    lte: oneHourFromNow
                },
                whatsapp_notified: false,
                swaps: {
                    none: {}
                }
            },
            include: {
                vehicle: true
            }
        });

        if (criticalEvents.length === 0) {
            console.log('[WhatsApp] Nenhum evento crítico de SLA encontrado.');
            return { success: true, count: 0 };
        }

        console.log(`[WhatsApp] ${criticalEvents.length} evento(s) crítico(s) de SLA encontrado(s).`);

        // Monta uma mensagem consolidada com todos os veículos críticos
        const vehicleList = criticalEvents.map(e => {
            const saida = format(new Date(e.saida_programada_at), 'HH:mm', { locale: ptBR });
            return `▪️ Carro *${e.vehicle.client_vehicle_number}* — saída às *${saida}*`;
        }).join('\n');

        const message = `⚠️ *ALERTA DE SLA — BUSMANAGER* ⚠️\n\n` +
            `Os veículos abaixo estão a *menos de 1 hora* da saída e a limpeza *não foi iniciada*:\n\n` +
            `${vehicleList}\n\n` +
            `Favor verificar com urgência! 🚌`;

        await sendWhatsAppMessage(message);

        console.log(`[WhatsApp] Mensagem enviada para ${criticalEvents.length} veículos.`);
        
        // Marca todos como notificados para não repetir
        await prisma.cleaningEvent.updateMany({
            where: {
                id: { in: criticalEvents.map(e => e.id) }
            },
            data: { whatsapp_notified: true }
        });

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
                started_by: true
            }
        });

        if (!event || !event.vehicle) return;

        const saida = format(new Date(event.saida_programada_at), 'HH:mm', { locale: ptBR });
        const usuario = event.started_by?.name || 'Sistema';

        const message = `⏳ *LIMPEZA INICIADA*\n\n` +
            `🚌 *Carro:* ${event.vehicle.client_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saida}\n` +
            `👤 *Iniciado por:* ${usuario}\n\n` +
            `Veículo entrou em processo de limpeza! 🚌`;

        sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha silenciosa no envio de início:', err.message);
        });
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
                completed_by: true
            }
        });

        if (!event || !event.vehicle) return;

        const saida = format(new Date(event.saida_programada_at), 'HH:mm', { locale: ptBR });
        const concluido = format(new Date(), 'HH:mm', { locale: ptBR });
        const usuario = event.completed_by?.name || 'Sistema';

        const message = `✅ *LIMPEZA CONCLUÍDA*\n\n` +
            `🚌 *Carro:* ${event.vehicle.client_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saida}\n` +
            `🏁 *Concluído às:* ${concluido}\n` +
            `👤 *Por:* ${usuario}\n\n` +
            `Equipe de limpeza finalizando! 🚌`;

        // Envio assíncrono (non-blocking para o usuário)
        sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha silenciosa no envio de conclusão:', err.message);
        });
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
        const saidaStr = format(new Date(details.saida), 'HH:mm', { locale: ptBR });

        const message = `🔄 *TROCA DE VEÍCULO*\n\n` +
            `❌ *Saiu:* ${details.original_vehicle_number}\n` +
            `✅ *Entrou:* ${details.replacement_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saidaStr}\n` +
            `📝 *Motivo:* ${details.motivo}\n` +
            `👤 *Por:* ${details.usuario}\n\n` +
            `Escala atualizada no BusManager! 🚌`;

        sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha silenciosa no envio de troca:', err.message);
        });
    } catch (error) {
        console.error('[WhatsApp] Erro ao preparar alerta de troca:', error);
    }
}

/**
 * Função base para envio de mensagens via Z-API
 */
async function sendWhatsAppMessage(text: string) {
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
            timeout: 15000 // Aumentado para 15s para lidar com lentidão da Z-API
        });
        console.log('[WhatsApp] Mensagem enviada com sucesso via Z-API.');
    } catch (error: any) {
        console.error('[WhatsApp] Falha ao enviar via Z-API:', error.response?.data || error.message);
        throw error;
    }
}
