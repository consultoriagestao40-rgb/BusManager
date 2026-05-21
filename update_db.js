const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Iniciando alteração do banco de dados...');
    
    const runSql = async (name, sql) => {
        try {
            console.log(`Executando: ${name}...`);
            await prisma.$executeRawUnsafe(sql);
            console.log(`✅ ${name} executado com sucesso!`);
        } catch (e) {
            if (e.message.includes('already exists') || e.message.includes('duplicate key value')) {
                console.log(`ℹ️ ${name} já existia no banco.`);
            } else {
                console.error(`❌ Erro em ${name}:`, e.message);
            }
        }
    };

    await runSql("Add CLIENT role", `ALTER TYPE "Role" ADD VALUE 'CLIENT';`);
    await runSql("Add at_yard column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "at_yard" BOOLEAN DEFAULT false;`);
    await runSql("Add revisar column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "revisar" BOOLEAN DEFAULT false;`);
    await runSql("Add whatsapp_yard_alert_sent column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "whatsapp_yard_alert_sent" BOOLEAN DEFAULT false;`);
    await runSql("Add yard_bypass column", `ALTER TABLE "CleaningEvent" ADD COLUMN IF NOT EXISTS "yard_bypass" BOOLEAN DEFAULT false;`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());

