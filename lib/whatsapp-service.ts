import prisma from '@/lib/prisma';
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
    // DESATIVADO TEMPORARIAMENTE PARA ESTABILIZAÇÃO
    console.log('[WhatsApp] Alertas de SLA desativados para estabilização.');
    return { success: true, reason: 'Temporarily disabled' };
}

/**
 * Envia alerta de início de limpeza
 */
export async function sendStartAlert(eventId: string) {
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_GROUP_ID) return;

    try {
        // Busca dados completo do evento
        const event = await prisma.cleaningEvent.findUnique({
            where: { id: eventId },
            include: { 
                vehicle: true,
                started_by: true,
                cleaner: true
            }
        });

        if (!event || !(event as any).vehicle) return;

        const saida = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(event.saida_programada_at));
        
        // Identifica se é Pátio ou Escala para o termo correto
        const isYard = event.event_business_key?.startsWith('YARD-');
        const cargoLabel = isYard ? 'Faxineiro' : 'Colaborador';
        const responsavel = event.cleaner?.name || event.started_by?.name || 'Sistema';

        const message = `⏳ *LIMPEZA INICIADA*\n\n` +
            `🚌 *Carro:* ${(event as any).vehicle.client_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saida}\n` +
            `👤 *${cargoLabel}:* ${responsavel}\n\n` +
            `Veículo entrou em processo de limpeza! 🚌`;

        // Agora com await real
        await sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha no envio de início:', err.message);
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
                completed_by: true,
                cleaner: true
            }
        });

        if (!event || !(event as any).vehicle) return;

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
        
        // Termo correto
        const isYard = event.event_business_key?.startsWith('YARD-');
        const cargoLabel = isYard ? 'Faxineiro' : 'Colaborador';
        const responsavel = event.cleaner?.name || event.completed_by?.name || 'Sistema';

        const message = `✅ *LIMPEZA CONCLUÍDA*\n\n` +
            `🚌 *Carro:* ${(event as any).vehicle.client_vehicle_number}\n` +
            `🕒 *Saída Prevista:* ${saida}\n` +
            `🏁 *Concluído às:* ${concluido}\n` +
            `👤 *${cargoLabel}:* ${responsavel}\n\n` +
            `Equipe de limpeza finalizando! 🚌`;

        // Aguarda o envio para garantir que a Vercel não corte a execução
        await sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha no envio:', err.message);
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

        sendWhatsAppMessage(message).catch(err => {
            console.error('[WhatsApp] Falha silenciosa no envio de troca:', err.message);
        });
    } catch (error) {
        console.error('[WhatsApp] Erro ao preparar alerta de troca:', error);
    }
}

/**
 * Função base para envio de mensagens via Z-API (EXPORTADA PARA RELATÓRIOS)
 */
export async function sendWhatsAppMessage(text: string) {
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
            timeout: 8000 // 8s é o ideal para o limite da Vercel
        });
        console.log('[WhatsApp] Mensagem enviada com sucesso via Z-API.');
    } catch (error: any) {
        console.error('[WhatsApp] Falha ao enviar via Z-API:', error.response?.data || error.message);
        throw error;
    }
}
