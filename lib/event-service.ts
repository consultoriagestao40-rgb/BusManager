import prisma from '@/lib/prisma';
import { EventStatus, SwapReason } from '@prisma/client';

export async function startEvent(eventId: string, userId: string) {
    return await prisma.cleaningEvent.update({
        where: { id: eventId },
        data: {
            status: 'EM_ANDAMENTO',
            started_at: new Date(),
            started_by_user_id: userId
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

    return await prisma.cleaningEvent.update({
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
            await tx.cleaningEvent.update({
                where: { id: eventId },
                data: {
                    vehicle_id: data.replacement_vehicle_id
                    // Note: SLA times (saida_programada_at) remain unchanged as per requirement
                }
            });
        }
    });
}
