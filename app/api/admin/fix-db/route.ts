import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const diagnostics: any = {
            timestamp: new Date().toISOString(),
            databaseUrl: process.env.POSTGRES_PRISMA_URL ? 'Defined (Hidden)' : 'NOT DEFINED'
        };

        // 1. Connection Check
        try {
            await prisma.$queryRaw`SELECT 1`;
            diagnostics.connection = "OK";
        } catch (e: any) {
            diagnostics.connectionError = e.message;
            return NextResponse.json(diagnostics, { status: 500 });
        }

        // 2. Schema Check & Fix
        try {
            // Check table names
            const tables: any = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
            diagnostics.tables = tables.map((t: any) => t.table_name);

            // Attempt to add column
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "no_patio" BOOLEAN DEFAULT true;`);
                diagnostics.noPatioFix = "Ensured 'no_patio' column exists.";
            } catch (e: any) {
                diagnostics.noPatioError = e.message;
            }

            // Attempt to add enum value
            try {
                // Check if value exists first (ADD VALUE IF NOT EXISTS is only PG 10+)
                // For simplicity, we just try and catch
                await prisma.$executeRawUnsafe(`ALTER TYPE "SwapReason" ADD VALUE 'CARRO_NAO_ESTA_NO_PATIO';`);
                diagnostics.enumFix = "Added 'CARRO_NAO_ESTA_NO_PATIO' to SwapReason.";
            } catch (e: any) {
                if (e.message.includes('already exists')) {
                    diagnostics.enumFix = "Enum value already exists.";
                } else {
                    diagnostics.enumError = e.message;
                }
            }
        } catch (e: any) {
            diagnostics.schemaError = e.message;
        }

        // 3. Data Check
        try {
            const count = await prisma.cleaningEvent.count();
            diagnostics.totalEvents = count;

            const activeVersion = await prisma.scheduleVersion.findFirst({ where: { is_active: true } });
            diagnostics.activeVersion = activeVersion ? { id: activeVersion.id, date: activeVersion.data_viagem } : "NONE";
        } catch (e: any) {
            diagnostics.dataError = e.message;
        }

        return NextResponse.json(diagnostics);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
