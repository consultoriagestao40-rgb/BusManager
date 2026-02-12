import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = file.name;
        const mimeType = file.type;

        console.log(`Received file: ${filename} (${mimeType}), Size: ${buffer.length} bytes`);

        // processImport call
        const { processImport } = await import('@/lib/importer');
        const result = await processImport(buffer, filename, mimeType, user.id);

        return NextResponse.json({
            success: true,
            importId: result.importId,
            count: result.count,
            duplicates: result.duplicates,
            parseErrors: result.parseErrors,
            message: result.duplicate ? 'Arquivo já importado anteriormente.' : 'Importação concluída com sucesso.'
        });

    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json(
            { error: `Erro interno: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500 }
        );
    }
}
