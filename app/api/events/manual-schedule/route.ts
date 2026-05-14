import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { startOfDay, endOfDay, subHours, subMinutes, parse, format } from 'date-fns';

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

        const { vehicle_number, saida_time } = await request.json();

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

        // 2. Build the departure datetime from the provided time string
        //    User types Brazil local time (e.g. "14:30" = 14:30 BRT = 17:30 UTC)
        //    We store as UTC in DB, browser reads as local (BRT), so we must add 3h
        const [hours, minutes] = saida_time.split(':').map(Number);
        // Start from UTC midnight of Brazil's today, then set UTC hours = BRT hours + 3
        const saida_date = new Date(start);
        saida_date.setUTCHours(hours + 3, minutes, 0, 0);

        // saida_programada_at and hora_viagem = client's departure time (stored as UTC)
        // liberar_ate_at = saida - 1h  (H-1, calculated automatically, NOT set by user)
        const saida_programada_at = saida_date;
        const hora_viagem = saida_date;
        const liberar_ate_at = subMinutes(saida_date, 60);

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
                    data_viagem: start,
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

        // 6. Create the CleaningEvent
        const businessKey = `MANUAL-SCHEDULE-${vehicle.id}-${Date.now()}`;

        const event = await prisma.cleaningEvent.create({
            data: {
                vehicle_id: vehicle.id,
                schedule_version_id: activeVersion.id,
                data_viagem: start,
                hora_viagem: hora_viagem,
                saida_programada_at: saida_programada_at,
                liberar_ate_at: liberar_ate_at,
                status: 'PREVISTO',
                empresa: 'MANUAL',
                motorista: '-',
                observacao_cliente: 'Adicionado manualmente pela encarregada',
                observacao_operacao: 'Inserção manual — sem escala do cliente',
                at_yard: true,
                event_business_key: businessKey
            },
            include: {
                vehicle: true
            }
        });

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
