import prisma from '@/lib/prisma';
import { EventStatus, SwapReason } from '@prisma/client';

export async function startEvent(eventId: string, userId: string) {
    return await prisma.cleaningEvent.update({
        where: { id: eventId },
        data: {
            status: 'EM_ANDAMENTO',
            started_at: new Date(),
            started_by_user_id: userId,
            at_yard: true
        }
    });
}

export async function completeEvent(
    eventId: string,
    userId: string,
    data: {
        check_interno: boolean;
        check_externo: boolean;
        check_pneus: boolean;
        observacao_operacao?: string;
    }
) {
    // Business Rule: If checks are not ALL true, observation is mandatory
    const allChecksPassed = data.check_interno && data.check_externo && data.check_pneus;

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
            observacao_operacao: data.observacao_operacao
        }
    });

    // Update Yard Inventory status if vehicle is in yard stock
    await prisma.yardInventory.updateMany({
        where: { vehicle_id: updatedEvent.vehicle_id },
        data: {
            status: 'LIMPO',
            last_cleaned_at: updatedEvent.finished_at,
            last_cleaner_id: updatedEvent.completed_by_user_id
        }
    });

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
    return await prisma.$transaction(async (tx) => {
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
}
