import prisma from './prisma';
import axios from 'axios';
import { addHours } from 'date-fns';

// Credenciais da Z-API
// Obtenha em: https://app.z-api.io -> Sua instância -> Credenciais
const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN; // Token de segurança do client
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID; // Ex: "120363XXXXXXXXX@g.us"

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
        // 3. Não tem troca registrada
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
            const saida = new Date(e.saida_programada_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo'
            });
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

async function sendWhatsAppMessage(text: string) {
    // Endpoint Z-API para envio de texto em grupos
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    try {
        await axios.post(url, {
            phone: WHATSAPP_GROUP_ID,
            message: text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': ZAPI_CLIENT_TOKEN || ''
            }
        });
        console.log('[WhatsApp] Mensagem enviada com sucesso via Z-API.');
    } catch (error: any) {
        console.error('[WhatsApp] Falha ao enviar via Z-API:', error.response?.data || error.message);
        throw error;
    }
}
