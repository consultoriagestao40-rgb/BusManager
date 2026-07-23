import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, addHours, addMinutes } from 'date-fns';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const { vehicle_id, empresa, motorista, observacao } = await request.json();

        if (!vehicle_id) {
            return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
        }

        // 1. Get current Brazil day
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const start = startOfDay(brazilNow);
        const end = endOfDay(brazilNow);

        // 2. Find active schedule version for today
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            return NextResponse.json({ error: 'No active schedule for today' }, { status: 400 });
        }

        // 3. Prevent duplicate active programming for this vehicle TODAY
        const existingEvent = await prisma.cleaningEvent.findFirst({
            where: {
                vehicle_id,
                data_viagem: { gte: start, lte: end },
                status: { in: ['PREVISTO', 'EM_ANDAMENTO'] }
            }
        });

        if (existingEvent) {
            return NextResponse.json({
                error: 'Este veículo já possui uma programação ativa para hoje.',
                eventId: existingEvent.id
            }, { status: 400 });
        }

        // 4. Find if vehicle is in Yard Inventory
        const yardStock = await prisma.yardInventory.findFirst({
            where: { vehicle_id }
        });

        let finalStatus: any = 'PREVISTO';
        let revisar = false;
        let check_interno = null;
        let check_externo = null;
        let check_pneus = null;
        let check_bagageiros = null;
        let check_latrina = null;
        let check_banheiro = null;
        let check_higiene = null;
        let check_ozonio = null;
        let check_poltronas = null;
        let started_at = null;
        let finished_at = null;
        let cleaner_id = null;
        let completed_by_user_id = null;

        let baseObs = observacao || 'Adicionado manualmente do pátio';
        let finalObservation = baseObs;

        if (yardStock) {
            if (yardStock.status === 'LIMPO') {
                finalStatus = 'CONCLUIDO';
                revisar = true;
                check_interno = true;
                check_externo = true;
                check_pneus = true;
                check_bagageiros = true;
                check_latrina = true;
                check_banheiro = true;
                check_higiene = true;
                check_ozonio = true;
                check_poltronas = true;
                started_at = yardStock.created_at;
                finished_at = yardStock.last_cleaned_at || new Date();
                cleaner_id = yardStock.last_cleaner_id;
                completed_by_user_id = yardStock.last_cleaner_id || user.id;

                let cleanerName = 'Faxineiro não identificado';
                if (yardStock.last_cleaner_id) {
                    const cleanerUser = await prisma.cleaner.findUnique({
                        where: { id: yardStock.last_cleaner_id },
                        select: { name: true }
                    });
                    if (cleanerUser) cleanerName = cleanerUser.name;
                }
                const cleanedTime = yardStock.last_cleaned_at
                    ? new Date(yardStock.last_cleaned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                finalObservation = `⚠️ Revisar carro - Limpo no Pátio (Limpo por ${cleanerName} às ${cleanedTime}). ${baseObs}`.trim();
            } else if (yardStock.status === 'EM_ANDAMENTO') {
                finalStatus = 'EM_ANDAMENTO';
                started_at = yardStock.created_at || new Date();
                cleaner_id = yardStock.last_cleaner_id;
            }
        }

        // Create Cleaning Event
        const event = await prisma.cleaningEvent.create({
            data: {
                vehicle_id,
                schedule_version_id: activeVersion.id,
                data_viagem: start,
                hora_viagem: now,
                saida_programada_at: now,
                liberar_ate_at: addMinutes(now, 90),
                status: finalStatus,
                revisar,
                check_interno,
                check_externo,
                check_pneus,
                check_bagageiros,
                check_latrina,
                check_banheiro,
                check_higiene,
                check_ozonio,
                check_poltronas,
                started_at,
                finished_at,
                cleaner_id,
                completed_by_user_id,
                empresa: empresa || 'MANUAL',
                motorista: motorista || '-',
                observacao_cliente: finalObservation,
                observacao_operacao: 'Sem Escala, carro do pátio',
                at_yard: true,
                event_business_key: `MANUAL-${vehicle_id}-${activeVersion.id}`
            },
            include: {
                vehicle: true
            }
        });

        // 5. Delete from Yard Inventory if it exists there (baixar do estoque)
        if (yardStock) {
            try {
                await prisma.yardInventory.delete({
                    where: { id: yardStock.id }
                });
            } catch (yardError) {
                console.error('Failed to remove from yard but event was created:', yardError);
            }
        }

        return NextResponse.json(event);
    } catch (error: any) {
        console.error('Manual Programming API error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            meta: error.meta
        });
        return NextResponse.json({
            error: 'Erro interno no servidor',
            details: error.message,
            code: error.code
        }, { status: 500 });
    }
}
