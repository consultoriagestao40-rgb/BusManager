-- CreateTable
CREATE TABLE "Cleaner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CleaningEvent" (
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
    "cleaner_id" TEXT,
    CONSTRAINT "CleaningEvent_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_schedule_version_id_fkey" FOREIGN KEY ("schedule_version_id") REFERENCES "ScheduleVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CleaningEvent_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "Cleaner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CleaningEvent" ("check_externo", "check_interno", "classe", "completed_by_user_id", "data_viagem", "empresa", "event_business_key", "finished_at", "hora_viagem", "id", "itinerario", "liberar_ate_at", "motorista", "numero_servico", "observacao_cliente", "observacao_operacao", "saida_programada_at", "schedule_version_id", "setor_limpeza", "situacao_totalbus", "started_at", "started_by_user_id", "status", "vehicle_id") SELECT "check_externo", "check_interno", "classe", "completed_by_user_id", "data_viagem", "empresa", "event_business_key", "finished_at", "hora_viagem", "id", "itinerario", "liberar_ate_at", "motorista", "numero_servico", "observacao_cliente", "observacao_operacao", "saida_programada_at", "schedule_version_id", "setor_limpeza", "situacao_totalbus", "started_at", "started_by_user_id", "status", "vehicle_id" FROM "CleaningEvent";
DROP TABLE "CleaningEvent";
ALTER TABLE "new_CleaningEvent" RENAME TO "CleaningEvent";
CREATE INDEX "CleaningEvent_data_viagem_idx" ON "CleaningEvent"("data_viagem");
CREATE INDEX "CleaningEvent_status_idx" ON "CleaningEvent"("status");
CREATE UNIQUE INDEX "CleaningEvent_schedule_version_id_event_business_key_key" ON "CleaningEvent"("schedule_version_id", "event_business_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
