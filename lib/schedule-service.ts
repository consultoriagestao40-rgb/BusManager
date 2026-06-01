import prisma from '@/lib/prisma';
import { NormalizedEvent, ParseResult } from './importer/types';
import { ChangeType, EventStatus } from '@prisma/client';
import { isEqual, parseISO } from 'date-fns';

export async function createScheduleVersion(
    importId: string,
    events: NormalizedEvent[],
    dataViagem: Date
) {
    return await prisma.$transaction(async (tx) => {
        // 1. Get previous active version for this date
        const previousVersion = await tx.scheduleVersion.findFirst({
            where: {
                data_viagem: dataViagem,
                is_active: true
            },
            include: {
                events: { include: { swaps: true } },
            },
            orderBy: { version_number: 'desc' }
        });

        const nextVersionNumber = previousVersion ? previousVersion.version_number + 1 : 1;

        // 2. Create new Version
        const newVersion = await tx.scheduleVersion.create({
            data: {
                data_viagem: dataViagem,
                version_number: nextVersionNumber,
                schedule_import_id: importId,
                is_active: true
            }
        });

        // Deactivate previous version
        if (previousVersion) {
            await tx.scheduleVersion.update({
                where: { id: previousVersion.id },
                data: { is_active: false }
            });
        }

        // 3. Process Events & Deduplicate
        const processedEvents: any[] = [];
        const keyCounts = new Map<string, number>();
        const duplicates: string[] = [];

        // Map old events for quick lookup
        const oldEventsMap = new Map();
        if (previousVersion?.events) {
            for (const evt of previousVersion.events) {
                oldEventsMap.set(evt.event_business_key, evt);
            }
        }

        for (const event of events) {
            let businessKey = event.event_business_key;

            // Check for duplicates
            if (keyCounts.has(businessKey)) {
                const count = keyCounts.get(businessKey)! + 1;
                keyCounts.set(businessKey, count);

                // Append suffix to make unique in DB
                businessKey = `${businessKey}_DUP${count}`;

                // Record for reporting
                duplicates.push(`${event.client_vehicle_number} (${event.hora_viagem}) - Importado como duplicata`);
            } else {
                keyCounts.set(businessKey, 1);
            }

            // Find or Create Vehicle
            let vehicle = await tx.vehicle.findUnique({
                where: { client_vehicle_number: event.client_vehicle_number }
            });

            if (!vehicle) {
                vehicle = await tx.vehicle.create({
                    data: {
                        client_vehicle_number: event.client_vehicle_number,
                        created_from_import_version_id: newVersion.id
                    }
                });
            }

            // Check if vehicle is in Yard Inventory and if it's already CLEAN
            const yardStock = await tx.yardInventory.findFirst({
                where: { vehicle_id: vehicle.id }
            });

            const isAlreadyClean = yardStock?.status === 'LIMPO';

            // Remove from Yard Inventory if it exists there (baixar do estoque)
            if (yardStock) {
                await tx.yardInventory.delete({
                    where: { id: yardStock.id }
                });
            }

            // Exclude client_vehicle_number as it's not in the CleaningEvent model
            const { client_vehicle_number, ...eventData } = event;

            // Use the already corrected date from the parser (which has +3h applied)
            const horaViagemDate = new Date(event.saida_programada_at);

            // If already clean, add alert to observation
            const baseObservation = event.observacao_cliente || '';
            let finalObservation = baseObservation;

            if (isAlreadyClean && yardStock) {
                // Try to find cleaner name if available
                let cleanerName = 'Faxineiro não identificado';
                if (yardStock.last_cleaner_id) {
                    const cleanerUser = await tx.cleaner.findUnique({
                        where: { id: yardStock.last_cleaner_id },
                        select: { name: true }
                    });
                    if (cleanerUser) cleanerName = cleanerUser.name;
                }

                const cleanedTime = yardStock.last_cleaned_at
                    ? new Date(yardStock.last_cleaned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                finalObservation = `⚠️ Revisar carro - Limpo no Pátio (Limpo por ${cleanerName} às ${cleanedTime}). ${baseObservation}`.trim();
            }

            let eventToCreate: any = {
                ...eventData,
                observacao_cliente: finalObservation,
                event_business_key: businessKey, // Use the potentially suffixed key
                hora_viagem: horaViagemDate,
                vehicle_id: vehicle.id,
                schedule_version_id: newVersion.id,
                status: 'PREVISTO', // Default
                liberar_ate_at: new Date(event.saida_programada_at.getTime() - 60 * 60 * 1000) // H-1
            };

            // If vehicle was in the yard, inherit its status and details
            if (yardStock) {
                eventToCreate.at_yard = true;
                if (yardStock.status === 'LIMPO') {
                    eventToCreate.status = 'CONCLUIDO';
                    eventToCreate.revisar = true;
                    eventToCreate.check_interno = true;
                    eventToCreate.check_externo = true;
                    eventToCreate.check_pneus = true;
                    eventToCreate.check_bagageiros = true;
                    eventToCreate.check_latrina = true;
                    eventToCreate.check_banheiro = true;
                    eventToCreate.check_higiene = true;
                    eventToCreate.check_ozonio = true;
                    eventToCreate.started_at = yardStock.created_at;
                    eventToCreate.finished_at = yardStock.last_cleaned_at || new Date();
                    eventToCreate.cleaner_id = yardStock.last_cleaner_id;
                } else if (yardStock.status === 'EM_ANDAMENTO') {
                    eventToCreate.status = 'EM_ANDAMENTO';
                    eventToCreate.started_at = yardStock.created_at || new Date();
                    eventToCreate.cleaner_id = yardStock.last_cleaner_id;
                }
            }

            // PRESERVE STATE LOGIC
            if (oldEventsMap.has(businessKey)) {
                const oldEvent = oldEventsMap.get(businessKey);
                // Check if event has interactions: Status is not PREVISTO OR has Swaps
                // Note: oldEvent.swaps comes from the include above
                const hasSwaps = oldEvent.swaps && oldEvent.swaps.length > 0;
                const isInteracted = oldEvent.status !== 'PREVISTO' || hasSwaps || oldEvent.at_yard;

                if (isInteracted) {
                    // COPY OPERATIONAL STATE
                    eventToCreate.status = oldEvent.status;
                    eventToCreate.vehicle_id = oldEvent.vehicle_id; // Keep swapped vehicle
                    eventToCreate.cleaner_id = oldEvent.cleaner_id;
                    eventToCreate.started_at = oldEvent.started_at;
                    eventToCreate.finished_at = oldEvent.finished_at;
                    eventToCreate.started_by_user_id = oldEvent.started_by_user_id;
                    eventToCreate.completed_by_user_id = oldEvent.completed_by_user_id;
                    eventToCreate.check_interno = oldEvent.check_interno;
                    eventToCreate.check_externo = oldEvent.check_externo;
                    eventToCreate.check_pneus = oldEvent.check_pneus;
                    eventToCreate.at_yard = oldEvent.at_yard;
                    eventToCreate.observacao_operacao = oldEvent.observacao_operacao;
                }
            }

            processedEvents.push(eventToCreate);
        }

        // Bulk Create Events
        if (processedEvents.length > 0) {
            for (const evt of processedEvents) {
                // Determine if we need to migrate swaps
                const businessKey = evt.event_business_key;
                const oldEvent = oldEventsMap.get(businessKey);
                const hasSwaps = oldEvent?.swaps && oldEvent.swaps.length > 0;

                const newEvent = await tx.cleaningEvent.create({ data: evt });

                // MIGRATE SWAPS
                if (hasSwaps) {
                    await tx.swap.updateMany({
                        where: { original_event_id: oldEvent.id },
                        data: { original_event_id: newEvent.id }
                    });
                }
            }
        }

        // 4. Calculate Diffs
        if (previousVersion) {
            await calculateDiffs(tx, previousVersion, newVersion, processedEvents);
        }

        return { version: newVersion, duplicates };
    });
}

async function calculateDiffs(tx: any, oldVersion: any, newVersion: any, newEvents: any[]) {
    const oldEventsMap = new Map(oldVersion.events.map((e: any) => [e.event_business_key, e]));
    const newEventsMap = new Map(newEvents.map((e: any) => [e.event_business_key, e]));

    // A. NEW Events
    for (const newEvent of newEvents) {
        if (!oldEventsMap.has(newEvent.event_business_key)) {
            await tx.scheduleChangeLog.create({
                data: {
                    data_viagem: newVersion.data_viagem,
                    from_version_id: oldVersion.id,
                    to_version_id: newVersion.id,
                    change_type: 'NEW',
                    event_business_key: newEvent.event_business_key,
                    vehicle_id: newEvent.vehicle_id,
                    new_values: newEvent as any
                }
            });
        } else {
            // Check for CHANGES (Informational)
            const oldEvent = oldEventsMap.get(newEvent.event_business_key) as any;
            // Compare specific fields
            const hasChanged =
                oldEvent.numero_servico !== newEvent.numero_servico ||
                oldEvent.motorista !== newEvent.motorista ||
                oldEvent.observacao_cliente !== newEvent.observacao_cliente;

            if (hasChanged) {
                await tx.scheduleChangeLog.create({
                    data: {
                        data_viagem: newVersion.data_viagem,
                        from_version_id: oldVersion.id,
                        to_version_id: newVersion.id,
                        change_type: 'CHANGED',
                        event_business_key: newEvent.event_business_key,
                        vehicle_id: newEvent.vehicle_id,
                        old_values: oldEvent as any,
                        new_values: newEvent as any
                    }
                });
            }
        }
    }

    // B. REMOVED Events
    for (const oldEvent of oldVersion.events) {
        if (!newEventsMap.has((oldEvent as any).event_business_key)) {
            // Mark as CANCELLED in the *previous* version context (conceptually) 
            // OR explicitly create a Cancelled event in the START? 
            // Requirement: "evento anterior deve ser marcado como CANCELADO por atualização"
            // BUT we also created a new version. The new version simply *doesn't have* the event.
            // If we want to show it as CANCELLED in the NEW version, we might need to copy it over with status CANCELLED.
            // HOWEVER, standard versioning usually implies specific snapshot.
            // If the requirement implies the dashboard for V2 shows the "missing" event as cancelled, 
            // then V2 needs to contain that event with status=CANCELLED.

            // Let's adopt the strategy: Copy the old event to the new version, but set status = CANCELLED.
            const {
                id, created_at, updated_at,
                swaps, vehicle, cleaner, started_by, completed_by,
                ...baseEventData
            } = oldEvent as any;

            const cancelledEventData = {
                ...baseEventData,
                schedule_version_id: newVersion.id,
                status: 'CANCELADO'
            };

            const newCancelledEvent = await tx.cleaningEvent.create({ data: cancelledEventData });

            // MIGRATE SWAPS for removed events
            if (oldEvent.swaps && oldEvent.swaps.length > 0) {
                await tx.swap.updateMany({
                    where: { original_event_id: oldEvent.id },
                    data: { original_event_id: newCancelledEvent.id }
                });
            }

            await tx.scheduleChangeLog.create({
                data: {
                    data_viagem: newVersion.data_viagem,
                    from_version_id: oldVersion.id,
                    to_version_id: newVersion.id,
                    change_type: 'REMOVED',
                    event_business_key: (oldEvent as any).event_business_key,
                    vehicle_id: (oldEvent as any).vehicle_id,
                    old_values: oldEvent as any
                }
            });
        }
    }
}
