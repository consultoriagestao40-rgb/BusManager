import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserFromToken } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cleaners = await prisma.cleaner.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json({ cleaners });

    } catch (error) {
        console.error('List Cleaners Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const { name } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const cleaner = await prisma.cleaner.create({
            data: { name }
        });

        return NextResponse.json({ cleaner });

    } catch (error) {
        console.error('Create Cleaner Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const { id, name, active } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const cleaner = await prisma.cleaner.update({
            where: { id },
            data: {
                name,
                active
            }
        });

        return NextResponse.json({ cleaner });

    } catch (error) {
        console.error('Update Cleaner Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await getUserFromToken(token) : null;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'CLIENT') {
            return NextResponse.json({ error: 'Acesso negado: Seu perfil possui apenas permissão de visualização. Contate um administrador para maiores permissões.' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        // Check if cleaner has history
        const historyCount = await prisma.cleaningEvent.count({
            where: { cleaner_id: id }
        });

        if (historyCount > 0) {
            // Soft delete (deactivate) if has history
            await prisma.cleaner.update({
                where: { id },
                data: { active: false }
            });
            return NextResponse.json({ message: 'Cleaner deactivated due to existing history' });
        } else {
            // Hard delete if no history
            await prisma.cleaner.delete({
                where: { id }
            });
            return NextResponse.json({ message: 'Cleaner deleted' });
        }

    } catch (error) {
        console.error('Delete Cleaner Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
