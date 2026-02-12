import { SignJWT, jwtVerify } from 'jose';
import db from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-me';
const key = new TextEncoder().encode(SECRET_KEY);

export async function hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return await bcrypt.compare(password, hash);
}

export async function signJWT(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('8h') // Token valid for shift duration
        .sign(key);
}

export async function verifyJWT(token: string) {
    try {
        const { payload } = await jwtVerify(token, key, {
            algorithms: ['HS256'],
        });
        return payload;
    } catch (error) {
        return null;
    }
}

export async function getUserFromToken(token: string) {
    const payload = await verifyJWT(token);
    if (!payload || !payload.sub) return null;

    const user = await db.user.findUnique({
        where: { id: String(payload.sub) },
    });

    return user;
}
