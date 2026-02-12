
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromToken, hashPassword } from '@/lib/auth';
import { cookies } from 'next/headers';

// PUT: Update user (Admin only)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const loggedUser = token ? await getUserFromToken(token) : null;

        if (!loggedUser || loggedUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { name, email, password, role, active } = body;

        const updateData: any = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (active !== undefined) updateData.active = active;
        if (password) {
            updateData.password_hash = await hashPassword(password);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData
        });

        const { password_hash: _, ...userWithoutHash } = updatedUser;
        return NextResponse.json({ user: userWithoutHash });

    } catch (error) {
        console.error('Update User API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE: Deactivate user (Admin only)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const loggedUser = token ? await getUserFromToken(token) : null;

        if (!loggedUser || loggedUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Prevent self-deactivation
        if (id === loggedUser.id) {
            return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { active: false }
        });

        return NextResponse.json({ message: 'User deactivated', user: updatedUser });

    } catch (error) {
        console.error('Delete User API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
