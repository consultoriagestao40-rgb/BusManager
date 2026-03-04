import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        // Proteção básica: Apenas ADMIN pode rodar
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('--- Iniciando Recuperação de Trocas via API ---');

        // Data de hoje
        const today = new Date(); // No servidor pegamos o "agora"
        // Ajuste para Horário de Brasília se necessário, mas startOfDay usa local do server.
        const start = startOfDay(today);
        const end = endOfDay(today);

        // 1. Encontrar a versão ATIVA de hoje
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            return NextResponse.json({ error: 'Nenhuma versão ativa encontrada para hoje.' }, { status: 404 });
        }

        // 2. Mapear eventos ativos pela business key
        const activeEvents = await prisma.cleaningEvent.findMany({
            where: { schedule_version_id: activeVersion.id }
        });
        const activeEventsMap = new Map(activeEvents.map(e => [e.event_business_key, e.id]));

        // 3. Encontrar todas as trocas de hoje que estão em versões INATIVAS
        const lostSwaps = await prisma.swap.findMany({
            where: {
                original_event: {
                    data_viagem: { gte: start, lte: end },
                    schedule_version_id: { not: activeVersion.id }
                }
            },
            include: {
                original_event: true
            }
        });

        let migratedCount = 0;

        // 4. Migrar cada troca
        for (const swap of lostSwaps) {
            const businessKey = swap.original_event.event_business_key;
            const newEventId = activeEventsMap.get(businessKey);

            if (newEventId) {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { original_event_id: newEventId }
                });
                migratedCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Recuperação concluída: ${migratedCount} trocas migradas para a versão ${activeVersion.version_number}.`,
            count: migratedCount
        });

    } catch (error: any) {
        console.error('Recovery API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
