import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const passwordHash = await bcrypt.hash('123456', 10);

    // Admin
    await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Admin User',
            password_hash: passwordHash,
            role: Role.ADMIN,
        },
    });

    // Supervisor
    await prisma.user.upsert({
        where: { email: 'supervisor@example.com' },
        update: {},
        create: {
            email: 'supervisor@example.com',
            name: 'Supervisor User',
            password_hash: passwordHash,
            role: Role.SUPERVISOR,
        },
    });

    // Operator
    await prisma.user.upsert({
        where: { email: 'operator@example.com' },
        update: {},
        create: {
            email: 'operator@example.com',
            name: 'Operator User',
            password_hash: passwordHash,
            role: Role.OPERATOR,
        },
    });

    console.log('Seed data created.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
