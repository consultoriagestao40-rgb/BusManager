
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const yardEvents = await prisma.cleaningEvent.findMany({
    where: {
      event_business_key: { startsWith: 'YARD-' }
    },
    select: {
      id: true,
      vehicle_id: true,
      event_business_key: true,
      data_viagem: true,
      status: true
    }
  });

  console.log(`Total YARD events: ${yardEvents.length}`);
  
  const counts: Record<string, number> = {};
  yardEvents.forEach(e => {
    const key = `${e.vehicle_id}-${e.data_viagem.toISOString().split('T')[0]}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);
  console.log(`Duplicates (vehicle-date combinations with >1 YARD event): ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('Sample duplicates:', duplicates.slice(0, 5));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
