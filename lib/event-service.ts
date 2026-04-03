import prisma from '@/lib/prisma';
import { EventStatus, SwapReason } from '@prisma/client';
import { sendCompletionAlert, sendSwapAlert, sendStartAlert } from './whatsapp-service';

export async function startEvent(eventId: string, userId: string) {
    const event = await prisma.cleaningEvent.findUnique({
        where: { id: eventId },
        include: { vehicle: true }
    });

    if (!event) throw new Error('Evento não encontrado');

    // Condition 02: If vehicle is in yard, remove it
    const yardItem = await prisma.yardInventory.findFirst({
        where: { vehicle_id: event.vehicle_id }
    });

    if (yardItem) {
        // If it's already clean in yard, we could auto-complete, 
        // but often 'start' in schedule means they want to re-verify or it's a new task.
        // User said: "se sair em escala normal, o sistema tira ele do patio e baixa ele"
        // "Baixa" might mean auto-complete if clean.
        
        if (yardItem.status === 'LIMPO' && event.status === 'PREVISTO') {
            const res = await prisma.cleaningEvent.update({
                where: { id: eventId },
                data: {
                    status: 'CONCLUIDO',
                    started_at: yardItem.created_at, // Use yard entry as start
                    finished_at: yardItem.last_cleaned_at || new Date(),
                    started_by_user_id: userId,
                    completed_by_user_id: yardItem.last_cleaner_id || userId,
                    check_interno: true,
                    check_externo: true,
                    check_pneus: true,
                    check_bagageiros: true,
                    at_yard: true,
                    observacao_operacao: (event.observacao_operacao || '') + ' (Recuperado de Pátio LIMPO)'.trim()
                }
            });
            await prisma.yardInventory.delete({ where: { id: yardItem.id } });
            
            // Envia alerta de conclusão (auto-concluído via pátio)
            sendCompletionAlert(eventId);
            
            return res;
        }

        await prisma.yardInventory.delete({
            where: { id: yardItem.id }
        });
    }

    const updated = await prisma.cleaningEvent.update({
        where: { id: eventId },
        data: {
            status: 'EM_ANDAMENTO',
            started_at: new Date(),
            started_by_user_id: userId,
            at_yard: true
        }
    });

    // Envia alerta de início
    sendStartAlert(eventId);

    return updated;
}

export async function completeEvent(
    eventId: string,
    userId: string,
    data: {
        check_interno: boolean;
        check_externo: boolean;
        check_pneus: boolean;
        check_bagageiros: boolean;
        observacao_operacao?: string;
    }
) {
    // Business Rule: If checks are not ALL true, observation is mandatory
    const allChecksPassed = data.check_interno && data.check_externo && data.check_pneus && data.check_bagageiros;

    if (!allChecksPassed) {
        // This check should ideally happen at API/Validation layer too, but double check here.
        if (!data.observacao_operacao?.trim()) {
            throw new Error('Observação é obrigatória quando o checklist não está completo (todos os 3 itens).');
        }
    }

    const updatedEvent = await prisma.cleaningEvent.update({
        where: { id: eventId },
        data: {
            status: 'CONCLUIDO',
            finished_at: new Date(),
            completed_by_user_id: userId,
            check_interno: data.check_interno,
            check_externo: data.check_externo,
            check_pneus: data.check_pneus,
            check_bagageiros: data.check_bagageiros,
            observacao_operacao: data.observacao_operacao,
            at_yard: true
        }
    });

    // Update Yard Inventory status if vehicle is in yard stock
    await prisma.yardInventory.updateMany({
        where: { vehicle_id: updatedEvent.vehicle_id },
        data: {
            status: 'LIMPO',
            last_cleaned_at: updatedEvent.finished_at,
            last_cleaner_id: updatedEvent.cleaner_id
        }
    });

    // Envia alerta de conclusão
    sendCompletionAlert(eventId);

    return updatedEvent;
}

export async function swapVehicle(
    eventId: string,
    userId: string,
    data: {
        replacement_vehicle_id?: string;
        motivo: SwapReason;
        observacao?: string;
    }
) {
    await prisma.$transaction(async (tx) => {
        const event = await tx.cleaningEvent.findUnique({
            where: { id: eventId }
        });

        if (!event) throw new Error('Evento não encontrado');

        // Create Swap Record
        await tx.swap.create({
            data: {
                original_event_id: eventId,
                original_vehicle_id: event.vehicle_id,
                replacement_vehicle_id: data.replacement_vehicle_id,
                motivo: data.motivo,
                observacao: data.observacao,
                created_by_user_id: userId
            }
        });

        // Update Event Vehicle if replacement provided
        if (data.replacement_vehicle_id) {
            // Check if replacement is already clean in yard stock
            const yardItem = await tx.yardInventory.findFirst({
                where: { vehicle_id: data.replacement_vehicle_id }
            });

            const isAlreadyClean = yardItem?.status === 'LIMPO';

            await tx.cleaningEvent.update({
                where: { id: eventId },
                data: {
                    vehicle_id: data.replacement_vehicle_id,
                    // Automated completion if pre-cleaned
                    ...(isAlreadyClean ? {
                        status: 'CONCLUIDO',
                        finished_at: yardItem.last_cleaned_at || new Date(),
                        completed_by_user_id: yardItem.last_cleaner_id || userId,
                        check_interno: true,
                        check_externo: true,
                        check_pneus: true,
                        check_bagageiros: true,
                        at_yard: true,
                        revisar: true,
                        observacao_operacao: (event.observacao_operacao || '') + ' (Recuperado de Pátio LIMPO)'.trim()
                    } : {
                        revisar: false
                    })
                }
            });

            // If we use a yard item in a swap, it MUST be removed from inventory
            if (yardItem) {
                await tx.yardInventory.delete({
                    where: { id: yardItem.id }
                });
            }
        }
    });

    // Envia alerta de troca após a transação
    try {
        const finalEvent = await prisma.cleaningEvent.findUnique({
            where: { id: eventId },
            include: { 
                vehicle: true,
                swaps: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    include: { 
                        original_vehicle: true,
                        replacement_vehicle: true,
                        created_by: true
                    }
                }
            }
        });

        if (finalEvent && finalEvent.swaps.length > 0) {
            const lastSwap = finalEvent.swaps[0];
            sendSwapAlert({
                original_vehicle_number: lastSwap.original_vehicle.client_vehicle_number,
                replacement_vehicle_number: lastSwap.replacement_vehicle?.client_vehicle_number || 'N/A',
                motivo: lastSwap.motivo,
                usuario: lastSwap.created_by.name || 'Sistema',
                saida: finalEvent.saida_programada_at
            });
        }
    } catch (e) {
        console.error('[WhatsApp] Erro ao enviar alerta de troca:', e);
    }
}

export async function updateYardStatus(
    vehicleId: string,
    status: 'SUJO' | 'EM_ANDAMENTO' | 'LIMPO',
    userId: string,
    checklist?: {
        check_interno: boolean;
        check_externo: boolean;
        check_pneus: boolean;
        check_bagageiros: boolean;
        cleaner_id?: string;
        observacao?: string;
    }
) {
    const yardItem = await prisma.yardInventory.findFirst({
        where: { vehicle_id: vehicleId }
    });

    if (!yardItem) throw new Error('Veículo não encontrado no pátio');

    if (status === 'EM_ANDAMENTO' && checklist?.cleaner_id) {
        // Create an "In Progress" event for the yard
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: { is_active: true },
            orderBy: { data_viagem: 'desc' }
        });

        if (activeVersion) {
            const eventBusinessKey = `YARD-${vehicleId}-${activeVersion.id}`;
            await prisma.cleaningEvent.upsert({
                where: {
                    schedule_version_id_event_business_key: {
                        schedule_version_id: activeVersion.id,
                        event_business_key: eventBusinessKey
                    }
                },
                update: {
                    status: 'EM_ANDAMENTO',
                    started_at: new Date(),
                    started_by_user_id: userId,
                    cleaner_id: checklist.cleaner_id,
                    at_yard: true
                },
                create: {
                    vehicle_id: vehicleId,
                    schedule_version_id: activeVersion.id,
                    data_viagem: activeVersion.data_viagem,
                    hora_viagem: new Date(),
                    saida_programada_at: new Date(),
                    liberar_ate_at: new Date(),
                    status: 'EM_ANDAMENTO',
                    started_at: new Date(),
                    started_by_user_id: userId,
                    cleaner_id: checklist.cleaner_id,
                    at_yard: true,
                    event_business_key: eventBusinessKey
                }
            });
        }

        const res = await prisma.yardInventory.update({
            where: { id: yardItem.id },
            data: { 
                status: 'EM_ANDAMENTO',
                last_cleaner_id: checklist.cleaner_id
            }
        });

        // Alerta de início via pátio
        if (activeVersion) {
            const eventBusinessKey = `YARD-${vehicleId}-${activeVersion.id}`;
            // Procuramos o ID do evento recém criado/atualizado pelo upsert anterior
            const event = await prisma.cleaningEvent.findUnique({
                where: {
                    schedule_version_id_event_business_key: {
                        schedule_version_id: activeVersion.id,
                        event_business_key: eventBusinessKey
                    }
                }
            });
            if (event) sendStartAlert(event.id);
        }

        return res;
    }

    if (status === 'LIMPO' && checklist) {
        // 1. Create a record of this yard cleaning
        const now = new Date();
        const activeVersion = await prisma.scheduleVersion.findFirst({
            where: { is_active: true },
            orderBy: { data_viagem: 'desc' }
        });

        if (activeVersion) {
            const eventBusinessKey = `YARD-${vehicleId}-${activeVersion.id}`;
            const eventRes = await prisma.cleaningEvent.upsert({
                where: {
                    schedule_version_id_event_business_key: {
                        schedule_version_id: activeVersion.id,
                        event_business_key: eventBusinessKey
                    }
                },
                update: {
                    status: 'CONCLUIDO',
                    finished_at: now,
                    completed_by_user_id: userId,
                    cleaner_id: checklist.cleaner_id,
                    check_interno: checklist.check_interno,
                    check_externo: checklist.check_externo,
                    check_pneus: checklist.check_pneus,
                    check_bagageiros: checklist.check_bagageiros,
                    observacao_operacao: checklist.observacao || 'Limpeza de Pátio',
                    at_yard: true
                },
                create: {
                    vehicle_id: vehicleId,
                    schedule_version_id: activeVersion.id,
                    data_viagem: activeVersion.data_viagem,
                    hora_viagem: now,
                    saida_programada_at: now,
                    liberar_ate_at: now,
                    status: 'CONCLUIDO',
                    started_at: yardItem.updated_at,
                    finished_at: now,
                    started_by_user_id: userId,
                    completed_by_user_id: userId,
                    cleaner_id: checklist.cleaner_id,
                    check_interno: checklist.check_interno,
                    check_externo: checklist.check_externo,
                    check_pneus: checklist.check_pneus,
                    check_bagageiros: checklist.check_bagageiros,
                    observacao_operacao: checklist.observacao || 'Limpeza de Pátio',
                    at_yard: true,
                    event_business_key: eventBusinessKey
                }
            });

            // Envia alerta de conclusão (limpeza de pátio)
            if (eventRes) {
                sendCompletionAlert(eventRes.id);
            }
        }

        return await prisma.yardInventory.update({
            where: { id: yardItem.id },
            data: {
                status: 'LIMPO',
                last_cleaned_at: now,
                last_cleaner_id: checklist.cleaner_id
            }
        });
    }

    return await prisma.yardInventory.update({
        where: { id: yardItem.id },
        data: { status }
    });
}
