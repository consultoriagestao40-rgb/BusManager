
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseISO, startOfDay, endOfDay, subDays, differenceInMinutes, format } from 'date-fns';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);

        // Default range: last 30 days
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');

        const end = endDateParam ? endOfDay(parseISO(endDateParam)) : endOfDay(new Date());
        const start = startDateParam ? startOfDay(parseISO(startDateParam)) : startOfDay(subDays(new Date(), 30));

        // 1. Fetch all relevant events for the period
        // It's often easier to fetch raw data and aggregate in code for complex logic like "delays" 
        // which depend on checking two fields, unless we use raw SQL.
        // For < 10k records, in-memory aggregation is fine and safer.
        const events = await prisma.cleaningEvent.findMany({
            where: {
                data_viagem: {
                    gte: start,
                    lte: end
                },
                schedule_version: { is_active: true }
            },
            include: {
                cleaner: true,
                swaps: true
            }
        });

        // 2. Aggregate Daily Stats
        const dailyMap = new Map();

        events.forEach((event: any) => {
            const dateKey = format(new Date(event.data_viagem), 'yyyy-MM-dd');

            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey,
                    total: 0,
                    completed: 0,
                    delayed: 0,
                    swaps: 0,
                    cancelled: 0,
                    not_completed: 0
                });
            }

            const stats = dailyMap.get(dateKey);
            stats.total += 1;

            if (event.status === 'CONCLUIDO') {
                stats.completed += 1;

                if (event.finished_at && event.liberar_ate_at) {
                    if (new Date(event.finished_at) > new Date(event.liberar_ate_at)) {
                        stats.delayed += 1;
                    }
                }
            } else if (event.status === 'CANCELADO') {
                stats.cancelled += 1;
            } else {
                // PREVISTO or EM_ANDAMENTO
                stats.not_completed += 1;
            }

            if (event.swaps && event.swaps.length > 0) {
                stats.swaps += event.swaps.length;
            }
        });

        const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        // 3. Performance Metrics
        const cleanerMap = new Map();
        let totalDuration = 0;
        let countDuration = 0;

        events.forEach(event => {
            if (event.status === 'CONCLUIDO' && event.started_at && event.finished_at) {
                const duration = differenceInMinutes(new Date(event.finished_at), new Date(event.started_at));

                if (duration > 0 && duration < 600) { // Filter outliers > 10h
                    totalDuration += duration;
                    countDuration++;

                    const cleanerId = event.cleaner_id || 'unassigned';
                    const cleanerName = event.cleaner ? event.cleaner.name : 'Não Definido';

                    if (!cleanerMap.has(cleanerId)) {
                        cleanerMap.set(cleanerId, { name: cleanerName, count: 0, totalTime: 0 });
                    }
                    const cStats = cleanerMap.get(cleanerId);
                    cStats.count += 1;
                    cStats.totalTime += duration;
                }
            }
        });

        const avgTime = countDuration > 0 ? Math.round(totalDuration / countDuration) : 0;

        const cleanerStats = Array.from(cleanerMap.values()).map((c: any) => ({
            name: c.name,
            count: c.count,
            avgTime: Math.round(c.totalTime / c.count)
        })).sort((a, b) => b.count - a.count); // Top cleaners

        // 4. Monthly Accumulated (Simple approximation from fetched data)
        // If the range is small, this might just show current month.
        // Ideally specific query for monthly, but let's reuse for now if range allows.

        const monthlyMap = new Map();
        events.forEach(event => {
            if (event.status === 'CONCLUIDO') {
                const monthKey = format(new Date(event.data_viagem), 'yyyy-MM');
                monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);
            }
        });

        const monthlyStats = Array.from(monthlyMap.entries()).map(([month, count]) => ({
            month,
            count
        })).sort((a, b) => a.month.localeCompare(b.month));

        // 5. Cumulative Stats (Cycle/Month Evolution)
        let accTotal = 0;
        let accCompleted = 0;

        const cumulativeStats = dailyStats.map(day => {
            accTotal += day.total;
            accCompleted += day.completed;
            return {
                date: day.date,
                accumulated_total: accTotal,
                accumulated_completed: accCompleted
            };
        });

        return NextResponse.json({
            daily: dailyStats,
            performance: {
                avgTimeGlobal: avgTime,
                byCleaner: cleanerStats
            },
            monthly: monthlyStats,
            cumulative: cumulativeStats
        });

    } catch (error) {
        console.error('KPI API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
