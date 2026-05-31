#!/bin/bash
# ============================================================
# migrate.sh — Smart migration script for TaskMgr
# Handles both fresh DB and existing DB scenarios
# ============================================================
set -e

DB_URL="${DATABASE_URL:-postgresql://taskmgr:taskmgr_secret@localhost:5434/taskmgr}"
export DATABASE_URL="$DB_URL"

echo "🔍 Checking database state..."

# Check if _prisma_migrations table exists (indicates Prisma has been initialized)
HAS_PRISMA_TABLE=$(PGPASSWORD="${POSTGRES_PASSWORD:-taskmgr_secret}" psql \
  -h "${POSTGRES_HOST:-localhost}" \
  -p "${POSTGRES_PORT:-5434}" \
  -U "${POSTGRES_USER:-taskmgr}" \
  -d "${POSTGRES_DB:-taskmgr}" \
  -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_prisma_migrations');" 2>/dev/null || echo "error")

# Check if work_orders table exists (indicates DB has data)
HAS_WORK_ORDERS=$(PGPASSWORD="${POSTGRES_PASSWORD:-taskmgr_secret}" psql \
  -h "${POSTGRES_HOST:-localhost}" \
  -p "${POSTGRES_PORT:-5434}" \
  -U "${POSTGRES_USER:-taskmgr}" \
  -d "${POSTGRES_DB:-taskmgr}" \
  -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'work_orders');" 2>/dev/null || echo "error")

if [ "$HAS_PRISMA_TABLE" = "t" ]; then
  echo "✅ Prisma migrations table found. Running normal migrate deploy..."
  npx prisma migrate deploy
elif [ "$HAS_WORK_ORDERS" = "t" ]; then
  echo "⚠️  Existing database WITHOUT Prisma migrations table detected."
  echo "   Baselining existing migrations..."

  # Mark all pre-existing migrations as applied (they're already in the DB)
  # The order matters — resolve from oldest to newest
  EXISTING_MIGRATIONS=(
    "00000000000000_init"
    "20260430000000_add_en_route_status"
    "20260501000000_v3_core"
    "20260501000001_add_type_config_tables"
    "20260502000001_add_task_type_prefix"
  )

  for migration in "${EXISTING_MIGRATIONS[@]}"; do
    echo "   📌 Marking as applied: $migration"
    npx prisma migrate resolve --applied "$migration" 2>/dev/null || true
  done

  echo "   🚀 Now applying remaining migrations..."
  npx prisma migrate deploy
else
  echo "🆕 Fresh database detected. Running full migration..."
  npx prisma migrate deploy
fi

echo ""
echo "✅ Migration complete!"
echo "   Generating Prisma client..."
npx prisma generate
echo "✅ Done! Ready to start."
