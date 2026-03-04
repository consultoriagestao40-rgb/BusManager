import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { no_patio } = await request.json();

        if (typeof no_patio !== 'boolean') {
            return NextResponse.json({ error: 'Invalid no_patio value' }, { status: 400 });
        }

        const updatedEvent = await prisma.cleaningEvent.update({
            where: { id },
            data: { no_patio }
        });

        return NextResponse.json({ event: updatedEvent });

    } catch (error: any) {
        console.error('No Patio Toggle Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
