-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATOR', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('PDF', 'XLSX', 'CSV', 'API');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PREVISTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('NEW', 'REMOVED', 'CHANGED', 'DEDUP_REMOVED');

-- CreateEnum
CREATE TYPE "SwapReason" AS ENUM ('QUEBRA', 'ONIBUS_NAO_CHEGOU_NO_HORARIO', 'MANUTENCAO', 'OUTROS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "client_vehicle_number" TEXT NOT NULL,
    "prefix" TEXT,
    "plate" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_from_import_version_id" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleImport" (
    "id" TEXT NOT NULL,
    "source_type" "ImportSourceType" NOT NULL,
    "original_filename" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by_user_id" TEXT,
    "status" "ImportStatus" NOT NULL,
    "error_details" TEXT,
    "content_hash" TEXT NOT NULL,
    "records_count_raw" INTEGER NOT NULL DEFAULT 0,
    "records_count_deduped" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduleImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleVersion" (
    "id" TEXT NOT NULL,
    "data_viagem" TIMESTAMP(3) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "schedule_import_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningEvent" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "data_viagem" TIMESTAMP(3) NOT NULL,
    "hora_viagem" TIMESTAMP(3) NOT NULL,
    "saida_programada_at" TIMESTAMP(3) NOT NULL,
    "liberar_ate_at" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PREVISTO',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "started_by_user_id" TEXT,
    "classe" TEXT,
    "situacao_totalbus" TEXT,
    "empresa" TEXT,
    "itinerario" TEXT,
    "numero_servico" TEXT,
    "motorista" TEXT,
    "setor_limpeza" TEXT,
    "observacao_cliente" TEXT,
    "check_interno" BOOLEAN,
    "check_externo" BOOLEAN,
    "observacao_operacao" TEXT,
    "schedule_version_id" TEXT NOT NULL,
    "event_business_key" TEXT NOT NULL,
    "cleaner_id" TEXT,

    CONSTRAINT "CleaningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cleaner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cleaner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeLog" (
    "id" TEXT NOT NULL,
    "data_viagem" TIMESTAMP(3) NOT NULL,
    "from_version_id" TEXT,
    "to_version_id" TEXT NOT NULL,
    "change_type" "ChangeType" NOT NULL,
    "event_business_key" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swap" (
    "id" TEXT NOT NULL,
    "original_event_id" TEXT NOT NULL,
    "original_vehicle_id" TEXT NOT NULL,
    "replacement_vehicle_id" TEXT,
    "motivo" "SwapReason" NOT NULL,
    "observacao" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Swap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_client_vehicle_number_key" ON "Vehicle"("client_vehicle_number");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleVersion_data_viagem_version_number_key" ON "ScheduleVersion"("data_viagem", "version_number");

-- CreateIndex
CREATE INDEX "CleaningEvent_data_viagem_idx" ON "CleaningEvent"("data_viagem");

-- CreateIndex
CREATE INDEX "CleaningEvent_status_idx" ON "CleaningEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningEvent_schedule_version_id_event_business_key_key" ON "CleaningEvent"("schedule_version_id", "event_business_key");

-- AddForeignKey
ALTER TABLE "ScheduleImport" ADD CONSTRAINT "ScheduleImport_imported_by_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_schedule_import_id_fkey" FOREIGN KEY ("schedule_import_id") REFERENCES "ScheduleImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningEvent" ADD CONSTRAINT "CleaningEvent_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "Cleaner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningEvent" ADD CONSTRAINT "CleaningEvent_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningEvent" ADD CONSTRAINT "CleaningEvent_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningEvent" ADD CONSTRAINT "CleaningEvent_schedule_version_id_fkey" FOREIGN KEY ("schedule_version_id") REFERENCES "ScheduleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningEvent" ADD CONSTRAINT "CleaningEvent_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_to_version_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "ScheduleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_from_version_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "ScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swap" ADD CONSTRAINT "Swap_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swap" ADD CONSTRAINT "Swap_replacement_vehicle_id_fkey" FOREIGN KEY ("replacement_vehicle_id") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swap" ADD CONSTRAINT "Swap_original_vehicle_id_fkey" FOREIGN KEY ("original_vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swap" ADD CONSTRAINT "Swap_original_event_id_fkey" FOREIGN KEY ("original_event_id") REFERENCES "CleaningEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
