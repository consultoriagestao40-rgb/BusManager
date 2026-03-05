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

        // 2. Schema Sync & Force Reset
        const schemaLogs: any[] = [];
        const runSql = async (name: string, sql: string) => {
            try {
                await prisma.$executeRawUnsafe(sql);
                schemaLogs.push({ name, status: "OK" });
            } catch (e: any) {
                schemaLogs.push({ name, status: "ERROR", error: e.message });
            }
        };

        try {
            // a) at_yard column check
            await runSql("Add at_yard column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "at_yard" BOOLEAN DEFAULT false;`);
            await runSql("Set at_yard default", `ALTER TABLE "CleaningEvent" ALTER COLUMN "at_yard" SET DEFAULT false;`);

            // b) Create Enum
            await runSql("Create Enum", `
                DO $$ BEGIN
                    CREATE TYPE "YardVehicleStatus" AS ENUM ('SUJO', 'LIMPO');
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;
            `);

            // c) Create Table
            await runSql("Create Table", `
                CREATE TABLE IF NOT EXISTS "YardInventory" (
                    "id" TEXT NOT NULL,
                    "vehicle_id" TEXT NOT NULL,
                    "status" "YardVehicleStatus" NOT NULL DEFAULT 'SUJO',
                    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "YardInventory_pkey" PRIMARY KEY ("id")
                );
            `);

            // Add foreign key separately
            await runSql("Add Foreign Key", `
                ALTER TABLE "YardInventory" 
                ADD CONSTRAINT "YardInventory_vehicle_id_fkey" 
                FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") 
                ON DELETE RESTRICT ON UPDATE CASCADE;
            `);

            // d) Create index
            await runSql("Create Index", `CREATE INDEX IF NOT EXISTS "YardInventory_created_at_idx" ON "YardInventory"("created_at");`);

            diagnostics.prismaCheck = {
                yardInventoryOnClient: typeof (prisma as any).yardInventory !== 'undefined'
            };

            // Force all existing records to false
            try {
                const result = await prisma.cleaningEvent.updateMany({
                    data: { at_yard: false } as any
                });
                diagnostics.atYardReset = result.count;
            } catch (e: any) {
                diagnostics.atYardResetError = e.message;
            }

            diagnostics.schemaFix = {
                status: "COMPLETED",
                logs: schemaLogs
            };
        } catch (e: any) {
            diagnostics.schemaError = e.message;
            diagnostics.schemaLogs = schemaLogs;
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
                    data_viagem: r.data_viagem,
                    at_yard: (r as any).at_yard // Explicitly check for debugging
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
