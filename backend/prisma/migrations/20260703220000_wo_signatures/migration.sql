-- B12 — Client + technician signatures captured at WO completion.
-- Stored as data-URLs (base64 PNG) directly on the WO row. Small payloads
-- (5-20 KB) so no need for a separate table or MinIO object.

ALTER TABLE "work_orders"
    ADD COLUMN "signature_client"     TEXT,
    ADD COLUMN "signature_technician" TEXT,
    ADD COLUMN "signed_at"            TIMESTAMP(3);
