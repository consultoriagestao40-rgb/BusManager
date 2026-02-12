import * as XLSX from 'xlsx';
import { ParseResult, NormalizedEvent } from './types';
import { parse, isValid } from 'date-fns';

export async function parseExcel(buffer: Buffer): Promise<ParseResult> {
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        const events: NormalizedEvent[] = [];
        const errors: string[] = [];

        // TODO: Map Excel columns to our NormalizedEvent structure.
        // Need sample Excel to know exact column names.
        // Assuming standard names for now.

        for (const [index, row] of rows.entries()) {
            try {
                // Validation Logic Stub
                if (!row['Nº do Veículo'] && !row['client_vehicle_number']) {
                    // Skip empty rows
                    continue;
                }

                // Mock mapping
                const event: NormalizedEvent = {
                    client_vehicle_number: row['Nº do Veículo'] || row['client_vehicle_number'],
                    data_viagem: new Date(), // Placeholder
                    hora_viagem: '00:00', // Placeholder
                    event_business_key: `v1-${index}`,
                    saida_programada_at: new Date()
                };

                events.push(event);

            } catch (e: any) {
                errors.push(`Row ${index + 1}: ${e.message}`);
            }
        }

        return {
            success: true,
            events,
            errors
        };

    } catch (error: any) {
        return {
            success: false,
            events: [],
            errors: [error.message]
        };
    }
}
