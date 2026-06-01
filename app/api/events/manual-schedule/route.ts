import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, subMinutes, format } from 'date-fns';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json(
                { error: 'Acesso negado: Seu perfil possui apenas permissão de visualização.' },
                { status: 403 }
            );
        }

        const { vehicle_number, saida_time, motivo } = await request.json();

        if (!vehicle_number || !saida_time) {
            return NextResponse.json(
                { error: 'Número do carro e horário de saída são obrigatórios.' },
                { status: 400 }
            );
        }

        // Validate time format HH:MM
        const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(saida_time)) {
            return NextResponse.json(
                { error: 'Horário de saída inválido. Use o formato HH:MM.' },
                { status: 400 }
            );
        }

        // 1. Calculate Brazil "today" (UTC-3)
        const now = new Date();
        const brazilNow = subHours(now, 3);
        const start = startOfDay(brazilNow);
        const end = endOfDay(brazilNow);

        // 2. Build the departure datetime — TIMEZONE-SAFE
        //
        // The user is in Brazil (UTC-3). They type "14:24" meaning 14h24 local time.
        // The browser's date-fns `format(new Date(stored), 'HH:mm')` reads UTC and
        // converts to the browser's local timezone (BRT = UTC-3).
        //
        // So: to display "14:24" in BRT, we need to store "14:24 UTC" in the DB.
        // The trick is to use Date.UTC with the BRAZIL date components (from brazilNow)
        // and the EXACT hours/minutes the user typed — no offset adjustment needed.
        // This works because: stored 14:24 UTC → browser (UTC-3) shows 11:24 BRT... 
        //
        // Wait — actually the display formula is: stored UTC → local BRT = UTC - 3h.
        // So to show "14:24 BRT" we store "17:24 UTC".
        // BUT we can bypass this entirely by using the fact that date-fns `format`
        // in Next.js client components runs in the BROWSER (BRT = UTC-3).
        // Therefore: store (user_hours + 3) as UTC hours → browser shows user_hours in BRT.
        //
        // Previous attempts failed because `startOfDay` depends on server local timezone.
        // Fix: use Date.UTC() exclusively — it is ALWAYS UTC regardless of server TZ.
        const [hours, minutes] = saida_time.split(':').map(Number);

        // Extract Brazil's today date components using UTC methods on brazilNow
        // (brazilNow was computed as now - 3h, so its UTC values = Brazil local values)
        const brazilYear = brazilNow.getUTCFullYear();
        const brazilMonth = brazilNow.getUTCMonth();   // 0-indexed
        const brazilDay = brazilNow.getUTCDate();

        // Build UTC timestamp: Brazil local HH:MM + 3h = UTC
        // Date.UTC handles hour overflow (e.g. 23 + 3 = 26 → rolls to next day correctly)
        const saidaMs = Date.UTC(brazilYear, brazilMonth, brazilDay, hours + 3, minutes, 0, 0);
        const saida_programada_at = new Date(saidaMs);
        const hora_viagem = new Date(saidaMs);
        const liberar_ate_at = subMinutes(saida_programada_at, 60); // H-1 automatic

        // data_viagem = UTC midnight of Brazil's today
        const data_viagem = new Date(Date.UTC(brazilYear, brazilMonth, brazilDay, 0, 0, 0, 0));

        // 3. Find or create Vehicle
        let vehicle = await prisma.vehicle.findUnique({
            where: { client_vehicle_number: vehicle_number.toString().trim() }
        });

        if (!vehicle) {
            vehicle = await prisma.vehicle.create({
                data: {
                    client_vehicle_number: vehicle_number.toString().trim()
                }
            });
        }

        // 4. Find active ScheduleVersion for today — or create one if none exists
        //    This handles the holiday scenario where no import was done
        let activeVersion = await prisma.scheduleVersion.findFirst({
            where: {
                data_viagem: { gte: start, lte: end },
                is_active: true
            }
        });

        if (!activeVersion) {
            // Holiday / no-PCP scenario: create a minimal ScheduleImport + ScheduleVersion
            const manualImport = await prisma.scheduleImport.create({
                data: {
                    source_type: 'API',
                    original_filename: `manual-${format(brazilNow, 'yyyy-MM-dd')}`,
                    status: 'SUCCESS',
                    content_hash: `manual-${Date.now()}`,
                    records_count_raw: 1,
                    records_count_deduped: 1,
                    imported_by_user_id: user.id
                }
            });

            activeVersion = await prisma.scheduleVersion.create({
                data: {
                    data_viagem: data_viagem,
                    version_number: 1,
                    schedule_import_id: manualImport.id,
                    is_active: true
                }
            });
        }

        // 5. Prevent duplicate: same vehicle, same day, active status
        const existingEvent = await prisma.cleaningEvent.findFirst({
            where: {
                vehicle_id: vehicle.id,
                data_viagem: { gte: start, lte: end },
                status: { in: ['PREVISTO', 'EM_ANDAMENTO'] }
            }
        });

        if (existingEvent) {
            return NextResponse.json(
                {
                    error: `O carro ${vehicle_number} já possui uma programação ativa para hoje.`,
                    eventId: existingEvent.id
                },
                { status: 400 }
            );
        }

        // 6. Check if vehicle is in Yard Inventory
        const yardStock = await prisma.yardInventory.findFirst({
            where: { vehicle_id: vehicle.id }
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
        let started_at = null;
        let finished_at = null;
        let cleaner_id = null;
        let completed_by_user_id = null;

        let baseObs = 'Adicionado manualmente pela encarregada';
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

        const businessKey = `MANUAL-SCHEDULE-${vehicle.id}-${Date.now()}`;

        const event = await prisma.cleaningEvent.create({
            data: {
                vehicle_id: vehicle.id,
                schedule_version_id: activeVersion.id,
                data_viagem: data_viagem,
                hora_viagem: hora_viagem,
                saida_programada_at: saida_programada_at,
                liberar_ate_at: liberar_ate_at,
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
                started_at,
                finished_at,
                cleaner_id,
                completed_by_user_id,
                empresa: 'MANUAL',
                motorista: '-',
                itinerario: motivo || 'Extra',
                observacao_cliente: finalObservation,
                observacao_operacao: `Extra - ${motivo || 'Turismo'} — Inserção manual`,
                at_yard: true,
                event_business_key: businessKey
            },
            include: {
                vehicle: true
            }
        });

        // Delete from Yard Inventory if it exists there (baixar do estoque)
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
        console.error('Manual Schedule API error:', {
            message: error.message,
            code: error.code,
            meta: error.meta
        });
        return NextResponse.json(
            {
                error: 'Erro interno no servidor',
                details: error.message,
                code: error.code
            },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json(
                { error: 'Acesso negado.' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('id');

        if (!eventId) {
            return NextResponse.json({ error: 'ID do evento é obrigatório.' }, { status: 400 });
        }

        // Only allow deleting manually-inserted events
        const event = await prisma.cleaningEvent.findUnique({
            where: { id: eventId }
        });

        if (!event) {
            return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
        }

        if (!event.event_business_key?.startsWith('MANUAL-SCHEDULE-')) {
            return NextResponse.json(
                { error: 'Apenas eventos inseridos manualmente podem ser excluídos por aqui.' },
                { status: 403 }
            );
        }

        await prisma.cleaningEvent.delete({ where: { id: eventId } });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Manual Schedule DELETE error:', error);
        return NextResponse.json(
            { error: 'Erro interno no servidor', details: error.message },
            { status: 500 }
        );
    }
}
