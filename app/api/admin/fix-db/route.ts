import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

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
            serverTime: new Date().toLocaleString(),
            databaseUrl: process.env.POSTGRES_PRISMA_URL ? 'Defined' : 'NOT DEFINED'
        };

        // 1. Connection Check
        try {
            await prisma.$queryRaw`SELECT 1`;
            diagnostics.connection = "OK";
        } catch (e: any) {
            diagnostics.connectionError = e.message;
            return NextResponse.json(diagnostics, { status: 500 });
        }

        // 2. Schema Sync (Field Rename)
        try {
            // First, check if no_patio exists and rename it to at_yard if it does
            await prisma.$executeRawUnsafe(`ALTER TABLE "CleaningEvent" RENAME COLUMN "no_patio" TO "at_yard";`).catch(() => { });

            // Then ensure at_yard exists with default false
            await prisma.$executeRawUnsafe(`ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "at_yard" BOOLEAN DEFAULT false;`);

            // If we just added it, or after rename, ensure default is false
            await prisma.$executeRawUnsafe(`ALTER TABLE "CleaningEvent" ALTER COLUMN "at_yard" SET DEFAULT false;`);

            diagnostics.schemaFix = "Ensured 'at_yard' column exists and default is false.";
        } catch (e: any) {
            diagnostics.schemaError = e.message;
        }

        // 3. Data Health Check
        try {
            const count = await prisma.cleaningEvent.count();
            diagnostics.totalEvents = count;

            // Look for any event from today (Brazil Time)
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            const todayEventsCount = await prisma.cleaningEvent.count({
                where: { data_viagem: { gte: start, lte: end } }
            });
            diagnostics.todayEventsCount = todayEventsCount;

            const activeVersionsToday = await prisma.scheduleVersion.findMany({
                where: {
                    data_viagem: { gte: start, lte: end },
                    is_active: true
                }
            });
            diagnostics.activeVersionsToday = activeVersionsToday.length;

            // Latest 3 versions in the system
            const latestVersions = await prisma.scheduleVersion.findMany({
                orderBy: { data_viagem: 'desc' },
                take: 3
            });
            diagnostics.latestVersions = latestVersions.map(v => ({ date: v.data_viagem, active: v.is_active }));

        } catch (e: any) {
            diagnostics.dataError = e.message;
        }

        // 3. Test exact Dashboard Query with Real Date
        try {
            const dateStr = new Date().toISOString().split('T')[0]; // "2026-03-04"
            const targetDate = parseISO(dateStr);
            const start = startOfDay(targetDate);
            const end = endOfDay(targetDate);

            diagnostics.queryWindow = { start, end };

            const results = await prisma.cleaningEvent.findMany({
                where: {
                    data_viagem: { gte: start, lte: end },
                    schedule_version: { is_active: true }
                },
                include: {
                    vehicle: { select: { client_vehicle_number: true } },
                    schedule_version: { select: { id: true, is_active: true } }
                },
                take: 5
            });

            diagnostics.dashboardQueryCount = results.length;
            if (results.length > 0) {
                diagnostics.sampleEvents = results.map(r => ({
                    id: r.id,
                    vehicle: r.vehicle.client_vehicle_number,
                    versionId: r.schedule_version.id,
                    data_viagem: r.data_viagem
                }));
            } else {
                // If empty, let's find WHY. Are there ANY events for today?
                const anyEventsToday = await prisma.cleaningEvent.findMany({
                    where: { data_viagem: { gte: start, lte: end } },
                    include: { schedule_version: { select: { is_active: true } } },
                    take: 5
                });
                diagnostics.anyEventsToday = anyEventsToday.map(r => ({
                    id: r.id,
                    active: r.schedule_version.is_active,
                    data_viagem: r.data_viagem
                }));
            }
        } catch (e: any) {
            diagnostics.dashboardQueryError = e.message;
        }

        return NextResponse.json(diagnostics);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
