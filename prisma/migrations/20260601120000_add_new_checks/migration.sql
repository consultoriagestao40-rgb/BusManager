-- AlterTable
ALTER TABLE "CleaningEvent" ADD COLUMN "check_latrina" BOOLEAN DEFAULT false;
ALTER TABLE "CleaningEvent" ADD COLUMN "check_banheiro" BOOLEAN DEFAULT false;
ALTER TABLE "CleaningEvent" ADD COLUMN "check_higiene" BOOLEAN DEFAULT false;
ALTER TABLE "CleaningEvent" ADD COLUMN "check_ozonio" BOOLEAN DEFAULT false;
