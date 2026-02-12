-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_vehicle_number" TEXT NOT NULL,
    "prefix" TEXT,
    "plate" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_from_import_version_id" TEXT
);

-- CreateTable
CREATE TABLE "ScheduleImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_type" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by_user_id" TEXT,
    "status" TEXT NOT NULL,
    "error_details" TEXT,
    "content_hash" TEXT NOT NULL,
    "records_count_raw" INTEGER NOT NULL DEFAULT 0,
    "records_count_deduped" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ScheduleImport_imported_by_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data_viagem" DATETIME NOT NULL,
    "version_number" INTEGER NOT NULL,
    "schedule_import_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScheduleVersion_schedule_import_id_fkey" FOREIGN KEY ("schedule_import_id") REFERENCES "ScheduleImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CleaningEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicle_id" TEXT NOT NULL,
    "data_viagem" DATETIME NOT NULL,
    "hora_viagem" DATETIME NOT NULL,
    "saida_programada_at" DATETIME NOT NULL,
    "liberar_ate_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVISTO',
    "started_at" DATETIME,
    "finished_at" DATETIME,
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
    CONSTRAINT "CleaningEvent_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_schedule_version_id_fkey" FOREIGN KEY ("schedule_version_id") REFERENCES "ScheduleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data_viagem" DATETIME NOT NULL,
    "from_version_id" TEXT,
    "to_version_id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "event_business_key" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleChangeLog_from_version_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "ScheduleVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduleChangeLog_to_version_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "ScheduleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Swap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "original_event_id" TEXT NOT NULL,
    "original_vehicle_id" TEXT NOT NULL,
    "replacement_vehicle_id" TEXT,
    "motivo" TEXT NOT NULL,
    "observacao" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Swap_original_event_id_fkey" FOREIGN KEY ("original_event_id") REFERENCES "CleaningEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Swap_original_vehicle_id_fkey" FOREIGN KEY ("original_vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Swap_replacement_vehicle_id_fkey" FOREIGN KEY ("replacement_vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Swap_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
