
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        // Fix events in scale that were marked as at_yard: true by mistake
        const fixed = await prisma.cleaningEvent.updateMany({
            where: {
                at_yard: true,
                NOT: {
                    event_business_key: { startsWith: 'YARD-' }
                }
            },
            data: {
                at_yard: false
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `Fixed ${fixed.count} events that were incorrectly marked as yard-only.` 
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
