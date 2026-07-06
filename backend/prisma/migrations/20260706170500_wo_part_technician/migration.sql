-- B24 — record which truck a TECHNICIAN_STOCK part came from (revert path).
ALTER TABLE "work_order_parts" ADD COLUMN "technician_id" TEXT;
