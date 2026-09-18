-- B42 — sous-traitance : « Mandaté par » sur le BT, « client de » sur la fiche client,
-- type de client PRINCIPAL (donneur d'ordre).

-- AlterEnum
ALTER TYPE "ClientType" ADD VALUE 'PRINCIPAL';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "principal_client_id" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "principal_client_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_clients_principal_client" ON "clients"("principal_client_id");
CREATE INDEX "idx_work_orders_principal_client" ON "work_orders"("principal_client_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_principal_client_id_fkey"
  FOREIGN KEY ("principal_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_principal_client_id_fkey"
  FOREIGN KEY ("principal_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Type de client « Donneur d'ordre » dans la configuration de chaque tenant (idempotent).
INSERT INTO "client_type_configs" ("id", "tenant_id", "name", "name_fr", "name_en", "code", "description", "description_fr", "description_en", "color", "icon", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", 'Donneur d''ordre', 'Donneur d''ordre', 'Principal', 'PRINCIPAL',
       'Client pour qui nous sous-traitons', 'Client pour qui nous sous-traitons', 'Client we subcontract for',
       '#0ea5e9', '🤝', true, 4, NOW(), NOW()
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "client_type_configs" c WHERE c."tenant_id" = t."id" AND c."code" = 'PRINCIPAL');
