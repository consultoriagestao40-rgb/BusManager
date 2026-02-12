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
                events: true,
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
        const seenKeys = new Set<string>();

        for (const event of events) {
            if (seenKeys.has(event.event_business_key)) {
                // Duplicate in same file - ignore or log
                continue;
            }
            seenKeys.add(event.event_business_key);

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

            // Exclude client_vehicle_number as it's not in the CleaningEvent model
            const { client_vehicle_number, ...eventData } = event;

            // Convert hh:mm string to Date
            const [hours, minutes] = event.hora_viagem.split(':').map(Number);
            const horaViagemDate = new Date(dataViagem);
            horaViagemDate.setHours(hours, minutes, 0, 0);

            processedEvents.push({
                ...eventData,
                hora_viagem: horaViagemDate,
                vehicle_id: vehicle.id,
                schedule_version_id: newVersion.id,
                status: 'PREVISTO', // Default
                liberar_ate_at: new Date(event.saida_programada_at.getTime() - 60 * 60 * 1000) // H-1
            });
        }

        // Bulk Create Events
        if (processedEvents.length > 0) {
            // Prisma createMany is not supported nicely with SQLite interaction in transaction sometimes?
            // SQLite supports createMany in recent versions.
            for (const evt of processedEvents) {
                await tx.cleaningEvent.create({ data: evt });
            }
        }

        // 4. Calculate Diffs
        if (previousVersion) {
            await calculateDiffs(tx, previousVersion, newVersion, processedEvents);
        }

        return newVersion;
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

            const cancelledEventData = {
                ...oldEvent,
                id: undefined, // Let it generate new ID
                schedule_version_id: newVersion.id,
                status: 'CANCELADO',
                updated_at: undefined,
                created_at: undefined
            };

            await tx.cleaningEvent.create({ data: cancelledEventData });

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
