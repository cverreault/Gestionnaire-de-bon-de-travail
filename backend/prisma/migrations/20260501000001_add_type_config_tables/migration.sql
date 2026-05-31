-- CreateTable
CREATE TABLE "client_type_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_type_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_type_configs_name_key" ON "client_type_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "client_type_configs_code_key" ON "client_type_configs"("code");

-- CreateIndex
CREATE INDEX "idx_client_type_configs_is_active" ON "client_type_configs"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "address_type_configs_name_key" ON "address_type_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "address_type_configs_code_key" ON "address_type_configs"("code");

-- CreateIndex
CREATE INDEX "idx_address_type_configs_is_active" ON "address_type_configs"("isActive");
