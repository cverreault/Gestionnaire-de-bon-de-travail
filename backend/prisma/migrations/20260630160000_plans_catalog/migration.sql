-- B7.8 — DB-backed plan catalog
--
-- The plan catalog used to live in `backend/src/modules/tenants/domain/
-- plan-catalog.ts` as a code constant. Moving it to a table lets the SA
-- edit prices, quotas and features from the UI without a redeploy and
-- unlocks per-seat pricing (`price_per_user_monthly`).
--
-- The `code` column reuses the existing `TenantPlan` enum so the FK
-- semantics between `tenants.plan` and `plans.code` stay enforced at the
-- type level. Adding a new plan still requires extending the enum first.

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" "TenantPlan" NOT NULL,
    "display_name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "price_monthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_per_user_monthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "max_users" INTEGER NOT NULL,
    "max_work_orders_per_month" INTEGER NOT NULL,
    "max_storage_mb" INTEGER NOT NULL,
    "max_clients" INTEGER NOT NULL,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- Seed the three default plans straight from the code catalog so the table
-- is immediately populated for new and existing installs. Prices and
-- quotas can be edited from the SA portal afterwards.
INSERT INTO "plans" (
  "id", "code", "display_name", "tagline", "description",
  "price_monthly", "price_per_user_monthly", "currency",
  "max_users", "max_work_orders_per_month", "max_storage_mb", "max_clients",
  "features", "recommended", "sort_order", "updated_at"
) VALUES
  (
    gen_random_uuid(), 'FREE', 'Découverte',
    'Pour tester TaskMgr en conditions réelles',
    'Idéal pour évaluer la plateforme sur un petit volume avant de basculer une équipe complète. Aucune carte requise.',
    0, 0, 'CAD',
    3, 50, 100, 25,
    ARRAY[
      'Jusqu''à 3 utilisateurs',
      '50 BTs par mois',
      '100 Mo de pièces jointes',
      '25 clients enregistrés',
      'Notifications email',
      'Mode hors-ligne sur tablette / mobile'
    ],
    false, 0, NOW()
  ),
  (
    gen_random_uuid(), 'PRO', 'Pro',
    'Pour les équipes terrain actives',
    'La formule recommandée pour une équipe de 5 à 15 techniciens avec un volume de BTs régulier.',
    0, 20, 'CAD',
    15, 1000, 10000, 500,
    ARRAY[
      'Jusqu''à 15 utilisateurs',
      '1 000 BTs par mois',
      '10 Go de pièces jointes',
      '500 clients enregistrés',
      'Notifications push (web + mobile)',
      'Audit complet + rapports',
      'Templates de BT illimités',
      'Support par email sous 24 h'
    ],
    true, 1, NOW()
  ),
  (
    gen_random_uuid(), 'ENTERPRISE', 'Entreprise',
    'Pour les organisations multi-sites',
    'Quotas élevés et services additionnels pour les organisations qui dispatcheraient plusieurs dizaines de techniciens en parallèle.',
    199, 0, 'CAD',
    100, 10000, 100000, 5000,
    ARRAY[
      'Jusqu''à 100 utilisateurs',
      '10 000 BTs par mois',
      '100 Go de pièces jointes',
      '5 000 clients enregistrés',
      'Support prioritaire (SLA 99,9 %)',
      'Backups offsite quotidiens',
      'Tableau de bord cross-tenant',
      'Onboarding accompagné'
    ],
    false, 2, NOW()
  );
