-- B22 — Stripe subscription billing: plan price binding + tenant linkage.

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "stripe_price_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" TEXT,
                      ADD COLUMN "stripe_subscription_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripe_customer_id_key" ON "tenants"("stripe_customer_id");
