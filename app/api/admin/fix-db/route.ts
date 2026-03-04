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

        const diagnostics: any = {};

        // 1. Check if we can query CleaningEvent
        try {
            const count = await prisma.cleaningEvent.count();
            diagnostics.cleaningEventCount = count;

            // Check if no_patio exists
            const oneEvent = await prisma.cleaningEvent.findFirst();
            diagnostics.noPatioExists = oneEvent ? ('no_patio' in oneEvent) : 'no events to check';
        } catch (e: any) {
            diagnostics.cleaningEventError = e.message;

            // 2. If it fails with "column does not exist", try to FIX IT
            if (e.message.includes('column "no_patio" does not exist')) {
                diagnostics.attemptingFix = "Adding missing column 'no_patio'...";
                try {
                    await prisma.$executeRawUnsafe(`ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "no_patio" BOOLEAN DEFAULT true;`);
                    diagnostics.fixResult = "Column 'no_patio' added successfully.";

                    // Also try adding the enum value if it's missing (Postgres specific)
                    try {
                        await prisma.$executeRawUnsafe(`ALTER TYPE "SwapReason" ADD VALUE IF NOT EXISTS 'CARRO_NAO_ESTA_NO_PATIO';`);
                        diagnostics.enumFixResult = "Enum value added successfully.";
                    } catch (e2: any) {
                        diagnostics.enumFixError = e2.message;
                    }
                } catch (fixError: any) {
                    diagnostics.fixError = fixError.message;
                }
            }
        }

        // 3. Check ScheduleVersions
        try {
            const activeVersions = await prisma.scheduleVersion.findMany({
                where: { is_active: true }
            });
            diagnostics.activeVersionsCount = activeVersions.length;
            diagnostics.activeVersions = activeVersions.map(v => ({ id: v.id, date: v.data_viagem, v: v.version_number }));
        } catch (e: any) {
            diagnostics.scheduleVersionError = e.message;
        }

        return NextResponse.json(diagnostics);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
