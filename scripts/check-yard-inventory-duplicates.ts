
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Verificando duplicatas no YardInventory...');
    const items = await prisma.yardInventory.findMany({
        include: { vehicle: true }
    });

    const counts: Record<string, number> = {};
    for (const item of items) {
        counts[item.vehicle_id] = (counts[item.vehicle_id] || 0) + 1;
    }

    const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);
    
    if (duplicates.length === 0) {
        console.log('✅ Nenhuma duplicata encontrada no YardInventory.');
    } else {
        console.log(`❌ Encontrados ${duplicates.length} veículos com entradas duplicadas no pátio.`);
        for (const [vehicleId, count] of duplicates) {
            const vehicle = items.find(i => i.vehicle_id === vehicleId)?.vehicle;
            console.log(`- Veículo ${vehicle?.client_vehicle_number} (ID: ${vehicleId}): ${count} entradas`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
