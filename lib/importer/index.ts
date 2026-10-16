import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { parsePdf } from './pdf-parser';
import { parseExcel } from './excel-parser';
import { ImportSourceType } from '@prisma/client';

export async function processImport(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    userId: string
) {
    // 1. Calculate Hash
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check for duplicate import (idempotency)
    const existingImport = await prisma.scheduleImport.findFirst({
        where: { content_hash: hash, status: 'SUCCESS' }
    });

    /*
    if (existingImport) {
        console.log('Duplicate import detected, but proceeding to force update.');
        // return { duplicate: true, importId: existingImport.id };
    }
    */

    // 2. Determine Source Type
    let sourceType: ImportSourceType = 'API';
    if (mimeType.includes('pdf')) sourceType = 'PDF';
    else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) sourceType = 'XLSX';
    else if (mimeType.includes('csv')) sourceType = 'CSV';

    // 3. Create Import Record
    const importRecord = await prisma.scheduleImport.create({
        data: {
            source_type: sourceType,
            original_filename: filename,
            content_hash: hash,
            imported_by_user_id: userId,
            status: 'PARTIAL', // Start as partial
        }
    });

    try {
        // 4. Parse File
        let parseResult;
        if (sourceType === 'PDF') {
            parseResult = await parsePdf(fileBuffer);
        } else if (sourceType === 'XLSX' || sourceType === 'CSV') {
            parseResult = await parseExcel(fileBuffer);
        } else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }

        if (!parseResult.success && parseResult.events.length === 0) {
            throw new Error(parseResult.errors.join(', '));
        }

        if (parseResult.errors.length > 0) {
            console.warn(`Avisos ocorridos durante o parsing do PDF: ${parseResult.errors.length}`);
        }

        // 5. Create Version & Events
        const events = parseResult.events;

        // Determine data_viagem:
        // Priority 1: Check if filename contains a date like schedule-DD-MM-YYYY or DD-MM-YYYY
        let dataViagem: Date | null = null;
        const filenameMatch = filename.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
        if (filenameMatch) {
            const [, d, m, y] = filenameMatch;
            dataViagem = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
        }

        // Priority 2: Statistical mode (most frequent date) among parsed events
        if (!dataViagem || isNaN(dataViagem.getTime())) {
            if (events.length > 0) {
                const dateCounts = new Map<string, { count: number; date: Date }>();
                for (const evt of events) {
                    const key = evt.data_viagem.toISOString().substring(0, 10);
                    const current = dateCounts.get(key) || { count: 0, date: evt.data_viagem };
                    current.count++;
                    dateCounts.set(key, current);
                }
                let bestDate = events[0].data_viagem;
                let maxCount = 0;
                for (const item of dateCounts.values()) {
                    if (item.count > maxCount) {
                        maxCount = item.count;
                        bestDate = item.date;
                    }
                }
                dataViagem = bestDate;
            } else {
                dataViagem = new Date();
            }
        }

        // Call Schedule Service
        // We need to dynamic import to avoid circular checks if any,/
        // or just import at top.
        const { createScheduleVersion } = await import('../schedule-service');

        const { duplicates } = await createScheduleVersion(importRecord.id, events, dataViagem);

        await prisma.scheduleImport.update({
            where: { id: importRecord.id },
            data: {
                status: 'SUCCESS',
                records_count_raw: parseResult.events.length
            }
        });

        return {
            success: true,
            importId: importRecord.id,
            count: parseResult.events.length,
            duplicates,
            parseErrors: parseResult.errors,
            duplicate: false
        };

    } catch (error: any) {
        await prisma.scheduleImport.update({
            where: { id: importRecord.id },
            data: {
                status: 'FAILED',
                error_details: error.message
            }
        });
        throw error;
    }
}
