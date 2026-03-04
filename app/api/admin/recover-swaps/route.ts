import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, parseISO } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        // Proteção básica: Apenas ADMIN pode rodar
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Logic consistent with dashboard events API
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const targetDate = dateParam ? parseISO(dateParam) : brazilNow;

        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        // 1. Encontrar a versão ATIVA
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            return NextResponse.json({
                error: 'Nenhuma versão ativa encontrada para a data selecionada.',
                date: targetDate.toISOString(),
                start: start.toISOString(),
                end: end.toISOString()
            }, { status: 404 });
        }

        // 2. Mapear eventos ativos pela business key
        const activeEvents = await prisma.cleaningEvent.findMany({
            where: { schedule_version_id: activeVersion.id }
        });
        const activeEventsMap = new Map(activeEvents.map(e => [e.event_business_key, e.id]));

        // 3. Encontrar todas as trocas que estão em versões INATIVAS
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
        const errors = [];

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
            } else {
                errors.push(`Troca ${swap.id}: Evento ${businessKey} não encontrado na versão ativa ${activeVersion.version_number}`);
            }
        }

        return NextResponse.json({
            success: true,
            date: targetDate.toISOString(),
            activeVersion: {
                id: activeVersion.id,
                number: activeVersion.version_number
            },
            foundSwaps: lostSwaps.length,
            migratedCount: migratedCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('Recovery API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
