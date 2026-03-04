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

        // 2. Data Health Check
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

        // 3. Test exact Dashboard Query
        try {
            const testStart = new Date();
            testStart.setHours(0, 0, 0, 0);
            const testEnd = new Date();
            testEnd.setHours(23, 59, 59, 999);

            await prisma.cleaningEvent.findMany({
                where: {
                    data_viagem: { gte: testStart, lte: testEnd },
                    schedule_version: { is_active: true }
                },
                include: { vehicle: true, swaps: true },
                take: 1
            });
            diagnostics.dashboardQueryTest = "SUCCESS";
        } catch (e: any) {
            diagnostics.dashboardQueryError = e.message;
        }

        return NextResponse.json(diagnostics);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
