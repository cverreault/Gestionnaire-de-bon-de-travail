-- B44 — Tags : libellés colorés définis par l'admin, posés sur clients, adresses et BT.

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_tags" (
    "work_order_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_tags_pkey" PRIMARY KEY ("work_order_id","tag_id")
);

-- CreateTable
CREATE TABLE "client_tags" (
    "client_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("client_id","tag_id")
);

-- CreateTable
CREATE TABLE "address_tags" (
    "address_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_tags_pkey" PRIMARY KEY ("address_id","tag_id")
);

-- CreateIndex
CREATE INDEX "idx_tags_tenant_id" ON "tags"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_tags_tenant_name" ON "tags"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_work_order_tags_tag_id" ON "work_order_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_client_tags_tag_id" ON "client_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_address_tags_tag_id" ON "address_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tags" ADD CONSTRAINT "work_order_tags_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tags" ADD CONSTRAINT "work_order_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_tags" ADD CONSTRAINT "address_tags_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "client_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_tags" ADD CONSTRAINT "address_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

