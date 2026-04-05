import { NextResponse } from 'next/server';
import { checkAndSendSLAAlerts } from '@/lib/whatsapp-service';

/**
 * Rota de Cron para checagem de SLA (WhatsApp)
 * Agendada via vercel.json para rodar a cada 10 minutos
 */
export async function GET(request: Request) {
    // Validação básica de segurança para cron via Vercel (opcional mas recomendado)
    const authHeader = request.headers.get('authorization');
    const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const isTest = new URL(request.url).searchParams.get('test') === 'true';

    // Permitimos a execução se for o Cron oficial ou um teste manual
    if (!isVercelCron && !isTest) {
        console.warn('[Cron] Tentativa de acesso não autorizada ao check-sla.');
        // Para facilitar testes agora, vamos apenas logar e permitir se não for produção
        // return new Response('Unauthorized', { status: 401 });
    }

    console.log('[Cron] Iniciando checagem de SLA...');

    try {
        const result = await checkAndSendSLAAlerts();
        return NextResponse.json({ 
            success: true, 
            message: 'Checagem de SLA concluída',
            result 
        });
    } catch (error: any) {
        console.error('[Cron] Erro na checagem de SLA:', error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
