-- ============================================================
-- Migration: add_process_engine
-- Adds:  process_definitions, process_statuses, process_transitions
--        FK columns on task_types (process_definition_id)
--        FK columns on work_orders (process_definition_id, current_step_id)
-- ============================================================

-- CreateTable: process_definitions
CREATE TABLE "process_definitions" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "version"     INTEGER      NOT NULL DEFAULT 1,
    "is_default"  BOOLEAN      NOT NULL DEFAULT false,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: process_statuses
CREATE TABLE "process_statuses" (
    "id"                    TEXT         NOT NULL,
    "process_definition_id" TEXT         NOT NULL,
    "code"                  INTEGER      NOT NULL,
    "name"                  TEXT         NOT NULL,
    "color"                 TEXT         NOT NULL DEFAULT '#6b7280',
    "position"              INTEGER      NOT NULL,
    "is_initial"            BOOLEAN      NOT NULL DEFAULT false,
    "is_dispatch"           BOOLEAN      NOT NULL DEFAULT false,
    "is_start"              BOOLEAN      NOT NULL DEFAULT false,
    "is_terminal_positive"  BOOLEAN      NOT NULL DEFAULT false,
    "is_terminal_negative"  BOOLEAN      NOT NULL DEFAULT false,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: process_transitions
CREATE TABLE "process_transitions" (
    "id"                    TEXT         NOT NULL,
    "process_definition_id" TEXT         NOT NULL,
    "from_status_id"        TEXT         NOT NULL,
    "to_status_id"          TEXT         NOT NULL,
    "label"                 TEXT         NOT NULL,
    "allowedRoles"          "Role"[]     NOT NULL DEFAULT ARRAY[]::"Role"[],
    "requiredFields"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sort_order"            INTEGER      NOT NULL DEFAULT 0,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_transitions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: task_types — add nullable FK to process_definitions
ALTER TABLE "task_types"
    ADD COLUMN "process_definition_id" TEXT;

-- AlterTable: work_orders — add nullable FK columns for process engine
ALTER TABLE "work_orders"
    ADD COLUMN "process_definition_id" TEXT,
    ADD COLUMN "current_step_id"       TEXT;

-- CreateIndex: process_definitions
CREATE UNIQUE INDEX "process_definitions_name_key"
    ON "process_definitions"("name");

CREATE INDEX "idx_process_definitions_is_default"
    ON "process_definitions"("is_default");

CREATE INDEX "idx_process_definitions_is_active"
    ON "process_definitions"("is_active");

-- CreateIndex: process_statuses
CREATE UNIQUE INDEX "uq_process_status_definition_code"
    ON "process_statuses"("process_definition_id", "code");

CREATE INDEX "idx_process_statuses_definition_id"
    ON "process_statuses"("process_definition_id");

CREATE INDEX "idx_process_statuses_position"
    ON "process_statuses"("position");

-- CreateIndex: process_transitions
CREATE UNIQUE INDEX "uq_process_transition_unique"
    ON "process_transitions"("process_definition_id", "from_status_id", "to_status_id");

CREATE INDEX "idx_process_transitions_definition_id"
    ON "process_transitions"("process_definition_id");

CREATE INDEX "idx_process_transitions_from_status_id"
    ON "process_transitions"("from_status_id");

-- CreateIndex: work_orders (process engine columns)
CREATE INDEX "idx_work_orders_process_definition_id"
    ON "work_orders"("process_definition_id");

CREATE INDEX "idx_work_orders_current_step_id"
    ON "work_orders"("current_step_id");

-- AddForeignKey: process_statuses → process_definitions (CASCADE)
ALTER TABLE "process_statuses"
    ADD CONSTRAINT "process_statuses_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_definitions (CASCADE)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_statuses (from_status_id)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_from_status_id_fkey"
    FOREIGN KEY ("from_status_id")
    REFERENCES "process_statuses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: process_transitions → process_statuses (to_status_id)
ALTER TABLE "process_transitions"
    ADD CONSTRAINT "process_transitions_to_status_id_fkey"
    FOREIGN KEY ("to_status_id")
    REFERENCES "process_statuses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: task_types → process_definitions
ALTER TABLE "task_types"
    ADD CONSTRAINT "task_types_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → process_definitions
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_process_definition_id_fkey"
    FOREIGN KEY ("process_definition_id")
    REFERENCES "process_definitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: work_orders → process_statuses (current_step_id)
ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_current_step_id_fkey"
    FOREIGN KEY ("current_step_id")
    REFERENCES "process_statuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
