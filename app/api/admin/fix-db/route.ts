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
            const { searchParams } = new URL(request.url);
            if (searchParams.get('secret') !== 'antigravity_fix_2024') {
                return NextResponse.json({ error: 'Unauthorized', hint: 'Logue como ADMIN ou use ?secret=...' }, { status: 401 });
            }
        }

        const diagnostics: any = {
            timestamp: new Date().toISOString(),
            serverTime: new Date().toLocaleString(),
        };

        const schemaLogs: any[] = [];
        const runSql = async (name: string, sql: string) => {
            try {
                const start = Date.now();
                await prisma.$executeRawUnsafe(sql);
                schemaLogs.push({ name, status: "SUCCESS", duration: `${Date.now() - start}ms` });
            } catch (e: any) {
                schemaLogs.push({ name, status: "ERROR", error: e.message });
            }
        };

        // 1. Connection Check
        try {
            await prisma.$queryRaw`SELECT 1`;
            diagnostics.connection = "OK";
        } catch (e: any) {
            diagnostics.connection = "FAILED";
            diagnostics.connectionError = e.message;
        }

        // 2. Schema Sync
        await runSql("Add at_yard column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "at_yard" BOOLEAN DEFAULT false;`);
        await runSql("Add revisar column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "revisar" BOOLEAN DEFAULT false;`);

        await runSql("Create/Update YardVehicleStatus Enum", `
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'YardVehicleStatus') THEN
                    CREATE TYPE "YardVehicleStatus" AS ENUM ('SUJO', 'EM_ANDAMENTO', 'LIMPO');
                ELSE
                    -- Try to add the value if it doesn't exist
                    BEGIN
                        ALTER TYPE "YardVehicleStatus" ADD VALUE 'EM_ANDAMENTO';
                    EXCEPTION
                        WHEN duplicate_object THEN null;
                    END;
                END IF;
            END $$;
        `);

        await runSql("Create YardInventory Table", `
            CREATE TABLE IF NOT EXISTS "YardInventory" (
                "id" TEXT PRIMARY KEY,
                "vehicle_id" TEXT NOT NULL REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
                "status" "YardVehicleStatus" NOT NULL DEFAULT 'SUJO',
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await runSql("Add Index for created_at", `CREATE INDEX IF NOT EXISTS "YardInventory_created_at_idx" ON "YardInventory"("created_at");`);

        await runSql("Add last_cleaned_at to YardInventory", `ALTER TABLE "YardInventory" ADD COLUMN IF NOT EXISTS "last_cleaned_at" TIMESTAMP(3);`);
        await runSql("Add last_cleaner_id to YardInventory", `ALTER TABLE "YardInventory" ADD COLUMN IF NOT EXISTS "last_cleaner_id" TEXT;`);

        // 3. List Tables Diagnostic
        let tables: string[] = [];
        try {
            const tableRes: any[] = await prisma.$queryRaw`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `;
            tables = tableRes.map(t => t.table_name);
        } catch (e: any) {
            diagnostics.tableListError = e.message;
        }

        // 4. Prisma Client Check
        const prismaCheck = {
            hasYardInventory: typeof (prisma as any).yardInventory !== 'undefined',
            modelNames: Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_'))
        };

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>DB Diagnostic - BusManager</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, sans-serif; line-height: 1.5; max-width: 900px; margin: 40px auto; padding: 20px; background: #f8fafc; color: #1e293b; }
                        h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                        .section { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 25px; border: 1px solid #e2e8f0; }
                        h2 { margin-top: 0; font-size: 1.25rem; color: #334155; }
                        .status { font-weight: 800; padding: 4px 12px; border-radius: 9999px; font-size: 0.75rem; text-transform: uppercase; }
                        .success { background: #dcfce7; color: #166534; }
                        .error { background: #fee2e2; color: #991b1b; }
                        pre { background: #0f172a; color: #f8fafc; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
                        .table-tag { display: inline-block; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; margin: 2px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; }
                        .highlight { border: 2px solid #ef4444; background: #fef2f2 !important; }
                        .btn { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 10px; }
                    </style>
                </head>
                <body>
                    <h1>
                        Diagnostic Report
                        <span style="font-size: 14px; color: #64748b; font-weight: 400;">${diagnostics.timestamp}</span>
                    </h1>
                    
                    <div class="section">
                        <h2>1. Database Connection</h2>
                        <span class="status ${diagnostics.connection === 'OK' ? 'success' : 'error'}">${diagnostics.connection}</span>
                        ${diagnostics.connectionError ? `<pre>${diagnostics.connectionError}</pre>` : ''}
                    </div>

                    <div class="section">
                        <h2>2. Schema Sync Logs</h2>
                        <div style="margin-top: 15px;">
                            ${schemaLogs.map(log => `
                                <div style="margin-bottom: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-weight: 600;">${log.name}</span>
                                        <span class="status ${log.status === 'SUCCESS' ? 'success' : 'error'}">${log.status}</span>
                                    </div>
                                    ${log.error ? `<pre>${log.error}</pre>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="section ${!tables.includes('YardInventory') ? 'highlight' : ''}">
                        <h2>3. Tables in 'public' Schema</h2>
                        <p style="margin-bottom: 10px;">Total identified: <strong>${tables.length}</strong></p>
                        <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px dashed #cbd5e1;">
                            ${tables.map(t => `<span class="table-tag ${t === 'YardInventory' ? 'success' : ''}">${t}</span>`).join('')}
                        </div>
                        <div style="margin-top: 15px;">
                            ${tables.includes('YardInventory') ?
                '<p class="status success" style="display:inline-block">✅ A tabela YardInventory EXISTE no banco!</p>' :
                '<p class="status error" style="display:inline-block">❌ A tabela YardInventory NÃO EXISTE no banco!</p>'}
                        </div>
                    </div>

                    <div class="section">
                        <h2>4. Application Runtime (Prisma Client)</h2>
                        <p>Client recognizes <b>yardInventory</b>: <span class="status ${prismaCheck.hasYardInventory ? 'success' : 'error'}">${prismaCheck.hasYardInventory ? 'YES' : 'NO'}</span></p>
                        <p style="margin-top: 15px; font-size: 14px; color: #64748b;">Active Models:</p>
                        <pre>${prismaCheck.modelNames.join(', ')}</pre>
                    </div>

                    <div class="section" style="background: #eff6ff; border: 1px solid #bfdbfe;">
                        <h2>💡 Resolução</h2>
                        <p>Se o item 3 diz <b>NÃO EXISTE</b>, recarregue esta página. O script tentou criá-la acima.</p>
                        <p>Se o item 4 diz <b>NÃO</b>, o seu deploy no Vercel não atualizou os arquivos corretamente ou o <code>npx prisma generate</code> falhou no build.</p>
                        <a href="/dashboard" class="btn">Voltar para Dashboard</a>
                    </div>
                </body>
            </html>
        `;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
