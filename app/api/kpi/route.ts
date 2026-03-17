
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


 
         const yardCleanings = await prisma.yardInventory.findMany({
             where: {
                 status: 'LIMPO',
                 last_cleaned_at: {
                     gte: start,
                     lte: end
                 }
             }
         });
 
         // Get ALL swaps for the period, even if the event version is now inactive
         const allSwaps = await prisma.swap.findMany({
             where: {
                 original_event: {
                     data_viagem: {
                         gte: start,
                         lte: end
                     }
                 }
             },
             include: {
                 original_event: true
             }
         });

        // 2. Aggregate Daily Stats (Updated with robust logic)
        const dailyMap = new Map();
        const yardCleaningsByDay = new Map<string, Set<string>>();

        events.forEach((event: any) => {
            const dateKey = format(new Date(event.data_viagem), 'yyyy-MM-dd');

            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey, total: 0, completed: 0, delayed: 0, swaps: 0, 
                    cancelled: 0, not_completed: 0, effective_total: 0, 
                    achievement_rate: 0, yard_cleanings: 0
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

                // Identify Yard Cleanings from Events (Strict Manual Logic)
                const isManualEvent = event.empresa === 'MANUAL' || 
                                    (event.observacao_operacao && event.observacao_operacao.toLowerCase().includes('pátio')) ||
                                    (event.observacao_operacao && event.observacao_operacao.toLowerCase().includes('sem escala'));
                
                if (isManualEvent) {
                    if (!yardCleaningsByDay.has(dateKey)) yardCleaningsByDay.set(dateKey, new Set());
                    yardCleaningsByDay.get(dateKey)?.add(event.vehicle_id);
                }
            } else if (event.status === 'CANCELADO') {
                stats.cancelled += 1;
            } else {
                stats.not_completed += 1;
            }
            
            // Note: We'll count swaps separately below from allSwaps
        });
 
        // 2b. Add cleanings from Yard Inventory (that might not have events)
        yardCleanings.forEach((item: any) => {
            const cleanDate = item.last_cleaned_at || item.updated_at || item.created_at;
            if (!cleanDate) return;
            
            const dateKey = format(new Date(cleanDate), 'yyyy-MM-dd');
            if (dateKey < format(start, 'yyyy-MM-dd') || dateKey > format(end, 'yyyy-MM-dd')) return;
 
            if (!yardCleaningsByDay.has(dateKey)) yardCleaningsByDay.set(dateKey, new Set());
            yardCleaningsByDay.get(dateKey)?.add(item.vehicle_id);
            
            // Ensure day exists in dailyMap
            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey, total: 0, completed: 0, delayed: 0, swaps: 0, 
                    cancelled: 0, not_completed: 0, effective_total: 0, 
                    achievement_rate: 0, yard_cleanings: 0
                });
            }
        });
 
        // 2c. Aggregate all swaps directly
        allSwaps.forEach((swap: any) => {
            if (!swap.original_event) return;
            const dateKey = format(new Date(swap.original_event.data_viagem), 'yyyy-MM-dd');
            
            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey, total: 0, completed: 0, delayed: 0, swaps: 0, 
                    cancelled: 0, not_completed: 0, effective_total: 0, 
                    achievement_rate: 0, yard_cleanings: 0
                });
            }
            const stats = dailyMap.get(dateKey);
            stats.swaps += 1;
        });
 
        // 2d. Finalize yard_cleanings counts
        yardCleaningsByDay.forEach((vehicles, dateKey) => {
            const stats = dailyMap.get(dateKey);
            if (stats) stats.yard_cleanings = vehicles.size;
        });

        const dailyStats = Array.from(dailyMap.values()).map(day => {
            const effective = day.total - day.cancelled;
            return {
                ...day,
                effective_total: effective,
                achievement_rate: effective > 0 ? Math.round((day.completed / effective) * 100) : 0
            };
        }).sort((a, b) => a.date.localeCompare(b.date));

        // 3. Performance Metrics
        const cleanerMap = new Map();
        let totalDuration = 0;
        let countDuration = 0;

        events.forEach((event: any) => {
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
        events.forEach((event: any) => {
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
            accTotal += (day.total - day.cancelled);
            accCompleted += day.completed;
            return {
                date: day.date,
                accumulated_total: accTotal,
                accumulated_completed: accCompleted,
                accumulated_achievement_rate: accTotal > 0 ? Math.round((accCompleted / accTotal) * 100) : 0
            };
        });

        // 6. Swap Reason Ranking
        const swapReasonMap = new Map<string, number>();

        events.forEach((event: any) => {
            if (event.swaps && event.swaps.length > 0) {
                event.swaps.forEach((swap: any) => {
                    let reason = swap.motivo;

                    // Extract real reason from observation if it was mapped to OUTROS
                    if (reason === 'OUTROS' && swap.observacao && swap.observacao.includes('[Motivo:')) {
                        const match = swap.observacao.match(/\[Motivo: (.*?)\]/);
                        if (match && match[1]) {
                            reason = match[1];
                        }
                    }

                    // Beautify reason text
                    reason = reason.charAt(0).toUpperCase() + reason.slice(1).toLowerCase().replace(/_/g, ' ');

                    swapReasonMap.set(reason, (swapReasonMap.get(reason) || 0) + 1);
                });
            }
        });

        const swapRanking = Array.from(swapReasonMap.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({
            daily: dailyStats,
            performance: {
                avgTimeGlobal: avgTime,
                byCleaner: cleanerStats
            },
            monthly: monthlyStats,
            cumulative: cumulativeStats,
            swapRanking: swapRanking
        });

    } catch (error) {
        console.error('KPI API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
