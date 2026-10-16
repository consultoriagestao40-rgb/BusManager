import { NextResponse } from 'next/server';
import { triggerScheduleSync } from '@/app/api/schedule/sync/route';

/**
 * Endpoint de Cron do Vercel para sincronização de escala.
 * Executado periodicamente para garantir que as escalas estejam sempre
 * sincronizadas à meia-noite (00:00 BRT) e ao amanhecer, disparando o workflow do GitHub Actions.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const isVercelCron = process.env.CRON_SECRET ? authHeader === `Bearer ${process.env.CRON_SECRET}` : true;
    const isTest = new URL(request.url).searchParams.get('test') === 'true';

    if (!isVercelCron && !isTest) {
        console.warn('[Cron] Tentativa de acesso não autorizada a /api/cron/sync-schedule');
    }

    console.log('[Cron] Disparando sincronização de escala via GitHub Actions...');
    return await triggerScheduleSync();
}
