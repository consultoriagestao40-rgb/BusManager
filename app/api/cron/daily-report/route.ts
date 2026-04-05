import { NextResponse } from 'next/server';
import { sendDailySummaryReport } from '@/lib/daily-report-service';

/**
 * Rota para acionar o relatório diário.
 * Pode ser usada pelo Vercel Cron ou manualmente para testes.
 */
export async function GET(request: Request) {
    try {
        // Verifica se é uma requisição de teste (passando ?test=true)
        const { searchParams } = new URL(request.url);
        const isTest = searchParams.get('test') === 'true';
        
        // Se for teste, gera o relatório de HOJE até agora.
        // Se não for, gera o de ONTEM (comportamento padrão do cron).
        const targetDate = isTest ? new Date() : undefined;
        
        const result = await sendDailySummaryReport(targetDate);
        
        return NextResponse.json({ 
            success: true, 
            message: 'Relatório enviado com sucesso!',
            data: result
        });
    } catch (error: any) {
        console.error('[Cron] Erro ao gerar relatório diário:', error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
