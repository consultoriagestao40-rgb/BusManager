import { NextResponse } from 'next/server';
import { checkAndSendSLAAlerts } from '@/lib/whatsapp-service';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');

        // Proteção simples para o endpoint de cron
        if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await checkAndSendSLAAlerts();
        
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Falha na execução do Cron de Alertas de SLA:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
