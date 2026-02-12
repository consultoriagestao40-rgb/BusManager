// @ts-ignore
const pdf = require('pdf-parse/lib/pdf-parse.js');
import { ParseResult, NormalizedEvent } from './types';
import { parse, isValid, addHours, addMinutes } from 'date-fns';

export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
    try {
        console.log('Iniciando parsing do PDF...');
        const data = await pdf(buffer);
        const text = data.text;

        console.log('PDF text extracted length:', text.length);

        const events: NormalizedEvent[] = [];
        const errors: string[] = [];

        // Normalize newlines and split
        const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);

        let currentEventStr: {
            vehicleId: string;
            dateStr: string;
            timeStr: string;
            restOfLine: string;
            rawBuffer: string[];
        } | null = null;

        const eventStartRegex = /^(\d{4,6})(\d{2}\/\d{2}\/\d{4})(\d{2}:\d{2})(.*)$/;

        const processBuffer = (evt: typeof currentEventStr) => {
            if (!evt) return;

            try {
                // Parse date and time
                // Format: dd/MM/yyyy HH:mm
                // Forced update to clear cache
                const dtString = evt.dateStr + ' ' + evt.timeStr;
                const baseDate = parse(evt.dateStr, 'dd/MM/yyyy', new Date());

                if (!isValid(baseDate)) {
                    errors.push('Data inválida para veículo ' + evt.vehicleId + ': ' + evt.dateStr);
                    return;
                }

                const [hours, minutes] = evt.timeStr.split(':').map(Number);
                const scheduleDate = addMinutes(addHours(baseDate, hours), minutes);

                // Extract Metadata from Buffer
                let driverName: string | undefined;
                let serviceId: string | undefined;
                let company: string | undefined;
                let itinerary: string | undefined;
                let cleaningSector: string | undefined;
                let observation: string | undefined;

                const buffer = evt.rawBuffer;

                // Driver Regex: 8+ digits - Name
                const driverRegex = /^(\d{6,}) - (.*)$/;
                // Known Companies
                const companiesList = ['PIRACICABANA', 'EXPRESSO PENHA', 'PRINCESA DO NORTE', 'EMPRESA DE ONIBUS NOSSA SENHORA DA PENHA', 'CATARINENSE'];

                // Iterate to find driver and service
                for (let i = 0; i < buffer.length; i++) {
                    const line = buffer[i];

                    // Driver
                    const driverMatch = line.match(driverRegex);
                    if (driverMatch) {
                        driverName = line; // Keep full string or just name? Let's keep full for now "100... - Name"

                        // Service is usually the line before, if numeric
                        if (i > 0) {
                            const prevLine = buffer[i - 1];
                            // Check if strictly numeric and not a known company or part of itinerary
                            if (/^\d{3,10}$/.test(prevLine)) {
                                serviceId = prevLine;
                            }
                        }
                    }

                    // Company
                    if (!company && companiesList.some(c => line.includes(c))) {
                        company = line;
                    }

                    // Observation (keyword "CARRO " or "MANTA")
                    if (line.includes('CARRO SEM') || line.includes('CARRO COM') || line.includes('MANTA')) {
                        observation = observation ? stringConcat(observation, line) : line;
                    }
                }

                // Itinerary guess: Text between Company and Service/Driver
                // This is heuristic and might be improved later
                // Just fallback to empty/undefined if not found

                const eventKey = `${evt.vehicleId}-${evt.dateStr.replace(/\//g, '')}-${evt.timeStr.replace(':', '')}`;

                const normalized: NormalizedEvent = {
                    client_vehicle_number: evt.vehicleId,
                    data_viagem: baseDate,
                    hora_viagem: evt.timeStr,
                    saida_programada_at: scheduleDate,
                    event_business_key: eventKey,

                    classe: evt.restOfLine.length > 2 ? evt.restOfLine : undefined, // Sometimes class is in restOfLine
                    empresa: company,
                    numero_servico: serviceId,
                    motorista: driverName,
                    observacao_cliente: observation,
                    // situacao_totalbus: 'ATIVO' // Defaulting or extracting?
                };

                events.push(normalized);

            } catch (e: any) {
                errors.push('Erro processando veículo ' + evt.vehicleId + ': ' + e.message);
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(eventStartRegex);

            if (match) {
                // Process previous event
                if (currentEventStr) {
                    processBuffer(currentEventStr);
                }

                // Start new event
                currentEventStr = {
                    vehicleId: match[1],
                    dateStr: match[2],
                    timeStr: match[3],
                    restOfLine: match[4],
                    rawBuffer: []
                };
            } else {
                if (currentEventStr) {
                    currentEventStr.rawBuffer.push(line);
                }
            }
        }

        // Process last event
        if (currentEventStr) {
            processBuffer(currentEventStr);
        }

        return {
            success: true,
            events: events,
            errors: errors,
            metadata: { textLength: text.length, count: events.length }
        };

    } catch (error: any) {
        console.error('Erro no parsePdf:', error);
        return {
            success: false,
            events: [],
            errors: [error.message]
        };
    }
}

function stringConcat(a: string, b: string) {
    return `${a} ${b}`;
}
