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

    if (existingImport) {
        return { duplicate: true, importId: existingImport.id };
    }

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

        if (!parseResult.success) {
            throw new Error(parseResult.errors.join(', '));
        }

        // 5. Create Version & Events
        const events = parseResult.events;

        // Determine data_viagem from events or file date. 
        // For now, take the data_viagem of the first event, or today if missing.
        const dataViagem = events.length > 0 ? events[0].data_viagem : new Date();

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

        return { success: true, importId: importRecord.id, count: parseResult.events.length, duplicates };

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
