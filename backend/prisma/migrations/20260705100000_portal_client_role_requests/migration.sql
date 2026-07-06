-- B21 — Client portal: CLIENT role, portal user link, invitations,
-- REQUESTED work-order status and isRequested process flag.
-- NOTE: new enum values are not referenced inside this migration, so the
-- ADD VALUEs are transaction-safe (PostgreSQL 12+).

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENT';

-- AlterEnum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'REQUESTED';

-- AlterTable
ALTER TABLE "process_statuses" ADD COLUMN "is_requested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "client_id" TEXT;

-- CreateTable
CREATE TABLE "portal_invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_invitations_token_hash_key" ON "portal_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "idx_portal_invitations_client_id" ON "portal_invitations"("client_id");

-- CreateIndex
CREATE INDEX "idx_portal_invitations_user_id" ON "portal_invitations"("user_id");

-- CreateIndex
CREATE INDEX "idx_portal_invitations_tenant_id" ON "portal_invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_users_client_id" ON "users"("client_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
