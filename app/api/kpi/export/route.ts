import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseISO, startOfDay, endOfDay, subDays, differenceInMinutes, format, subHours } from 'date-fns';

function formatBRT(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const brDate = subHours(d, 3);
    return format(brDate, 'yyyy-MM-dd HH:mm');
}

function formatDateOnly(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return format(d, 'yyyy-MM-dd');
}

function escapeCSV(val: any): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${str}"`;
}

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');
        const exportFormat = searchParams.get('format') || 'csv'; // 'csv' | 'json' | 'md'

        const end = endDateParam ? endOfDay(parseISO(endDateParam)) : endOfDay(new Date());
        const start = startDateParam ? startOfDay(parseISO(startDateParam)) : startOfDay(subDays(new Date(), 30));

        const events = await prisma.cleaningEvent.findMany({
            where: {
                data_viagem: {
                    gte: start,
                    lte: end
                },
                schedule_version: {
                    is_active: true
                }
            },
            include: {
                cleaner: true,
                swaps: {
                    include: {
                        replacement_vehicle: true
                    }
                },
                vehicle: true
            },
            orderBy: [
                { data_viagem: 'asc' },
                { hora_viagem: 'asc' }
            ]
        });

        const startStr = formatDateOnly(start);
        const endStr = formatDateOnly(end);

        if (exportFormat === 'json') {
            const jsonPayload = {
                periodo: {
                    inicio: startStr,
                    fim: endStr
                },
                total_registros: events.length,
                eventos: events.map((ev) => {
                    const swap = ev.swaps?.[0];
                    let motivoTroca = swap?.motivo || null;
                    let obsTroca = swap?.observacao || null;
                    let submotivoTroca = null;
                    if (motivoTroca === 'OUTROS' && obsTroca && obsTroca.includes('[Motivo:')) {
                        const match = obsTroca.match(/\[Motivo: (.*?)\]/);
                        if (match && match[1]) submotivoTroca = match[1];
                    }

                    const duracao = ev.started_at && ev.finished_at
                        ? differenceInMinutes(new Date(ev.finished_at), new Date(ev.started_at))
                        : null;

                    const atrasou = ev.status === 'CONCLUIDO' && ev.finished_at && ev.liberar_ate_at
                        ? new Date(ev.finished_at) > new Date(ev.liberar_ate_at)
                        : false;

                    const minutosAtraso = atrasou && ev.finished_at && ev.liberar_ate_at
                        ? differenceInMinutes(new Date(ev.finished_at), new Date(ev.liberar_ate_at))
                        : 0;

                    return {
                        id: ev.id,
                        data_viagem: formatDateOnly(ev.data_viagem),
                        hora_programada: formatBRT(ev.hora_viagem),
                        liberar_ate: formatBRT(ev.liberar_ate_at),
                        inicio_limpeza: formatBRT(ev.started_at),
                        fim_limpeza: formatBRT(ev.finished_at),
                        duracao_minutos: duracao,
                        status: ev.status,
                        atrasou: atrasou ? 'SIM' : 'NAO',
                        minutos_atraso: minutosAtraso,
                        veiculo: ev.vehicle?.client_vehicle_number || ev.vehicle?.prefix || '',
                        placa: ev.vehicle?.plate || '',
                        higienizador: ev.cleaner?.name || (ev.cleaner_id ? `ID: ${ev.cleaner_id}` : 'Não Definido'),
                        teve_troca: swap ? 'SIM' : 'NAO',
                        motivo_troca: submotivoTroca || motivoTroca || '',
                        veiculo_substituto: swap?.replacement_vehicle?.client_vehicle_number || '',
                        observacao_troca: obsTroca || '',
                        classe: ev.classe || '',
                        motorista: ev.motorista || '',
                        observacao_cliente: ev.observacao_cliente || '',
                        observacao_operacao: ev.observacao_operacao || ''
                    };
                })
            };

            return new NextResponse(JSON.stringify(jsonPayload, null, 2), {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': `attachment; filename="dados_kpi_${startStr}_a_${endStr}.json"`
                }
            });
        }

        // CSV Export
        const headers = [
            'ID_Evento',
            'Data_Viagem',
            'Hora_Programada',
            'Horario_Liberar_Ate',
            'Horario_Inicio_Limpeza',
            'Horario_Fim_Limpeza',
            'Duracao_Minutos',
            'Status',
            'Atrasou',
            'Minutos_Atraso',
            'Prefixo_Veiculo',
            'Placa_Veiculo',
            'Nome_Higienizador',
            'Teve_Troca',
            'Motivo_Troca',
            'Submotivo_Troca',
            'Veiculo_Substituto',
            'Observacao_Troca',
            'Estava_No_Patio',
            'Bypass_Patio',
            'Classe_Servico',
            'Motorista',
            'Observacao_Cliente',
            'Observacao_Operacao'
        ];

        const rows = events.map((ev) => {
            let duracaoMin = '';
            if (ev.started_at && ev.finished_at) {
                const diff = differenceInMinutes(new Date(ev.finished_at), new Date(ev.started_at));
                if (diff >= 0 && diff < 600) duracaoMin = String(diff);
            }

            let atrasou = 'NAO';
            let minutosAtraso = 0;
            if (ev.status === 'CONCLUIDO' && ev.finished_at && ev.liberar_ate_at) {
                const diffAtraso = differenceInMinutes(new Date(ev.finished_at), new Date(ev.liberar_ate_at));
                if (diffAtraso > 0) {
                    atrasou = 'SIM';
                    minutosAtraso = diffAtraso;
                }
            }

            const swap = ev.swaps?.[0];
            let motivoTroca = '';
            let submotivoTroca = '';
            let obsTroca = '';
            let substituto = '';

            if (swap) {
                motivoTroca = swap.motivo;
                obsTroca = swap.observacao || '';
                if (motivoTroca === 'OUTROS' && obsTroca.includes('[Motivo:')) {
                    const match = obsTroca.match(/\[Motivo: (.*?)\]/);
                    if (match && match[1]) submotivoTroca = match[1];
                }
                if (swap.replacement_vehicle) {
                    substituto = swap.replacement_vehicle.client_vehicle_number || swap.replacement_vehicle.prefix || '';
                }
            }

            const cleanerName = ev.cleaner ? ev.cleaner.name : (ev.cleaner_id ? `ID: ${ev.cleaner_id}` : 'Não Definido');

            return [
                ev.id,
                formatDateOnly(ev.data_viagem),
                formatBRT(ev.hora_viagem),
                formatBRT(ev.liberar_ate_at),
                formatBRT(ev.started_at),
                formatBRT(ev.finished_at),
                duracaoMin,
                ev.status,
                atrasou,
                minutosAtraso,
                ev.vehicle ? (ev.vehicle.client_vehicle_number || ev.vehicle.prefix || '') : '',
                ev.vehicle ? (ev.vehicle.plate || '') : '',
                cleanerName,
                swap ? 'SIM' : 'NAO',
                motivoTroca,
                submotivoTroca,
                substituto,
                obsTroca,
                ev.at_yard ? 'SIM' : 'NAO',
                ev.yard_bypass ? 'SIM' : 'NAO',
                ev.classe || '',
                ev.motorista || '',
                ev.observacao_cliente || '',
                ev.observacao_operacao || ''
            ];
        });

        const csvString = '\uFEFF' + [
            headers.map(escapeCSV).join(';'),
            ...rows.map(r => r.map(escapeCSV).join(';'))
        ].join('\n');

        return new NextResponse(csvString, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="dados_kpi_${startStr}_a_${endStr}.csv"`
            }
        });

    } catch (error) {
        console.error('Export API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
