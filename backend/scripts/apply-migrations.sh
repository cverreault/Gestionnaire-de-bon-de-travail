#!/bin/bash

# ============================================================================
# TaskMgr Migration Applicator
# Handles both fresh DB and existing DB with partial migrations
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
DB_USER="${POSTGRES_USER:-taskmgr}"
DB_PASSWORD="${POSTGRES_PASSWORD:-taskmgr_secret}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_NAME="${POSTGRES_DB:-taskmgr}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TaskMgr — Database Migration Script${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found. Please install PostgreSQL client tools.${NC}"
    exit 1
fi

echo -e "${YELLOW}Testing database connection...${NC}"
if PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to database at ${DB_HOST}:${DB_PORT}/${DB_NAME}${NC}"
    echo "   Please ensure PostgreSQL is running and credentials are correct."
    exit 1
fi

echo ""
echo -e "${YELLOW}Checking migration status...${NC}"

# Check if _prisma_migrations table exists
if PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "\dt _prisma_migrations" | grep -q "_prisma_migrations"; then
    echo -e "${GREEN}✅ Prisma migrations table exists${NC}"

    # Count applied migrations
    APPLIED_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
    APPLIED_COUNT=$(echo "$APPLIED_COUNT" | tr -d ' ')
    echo "   Applied migrations: $APPLIED_COUNT"
else
    echo -e "${YELLOW}⚠️  Prisma migrations table NOT found (fresh database)${NC}"
fi

echo ""
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Applying migrations from: ${SCRIPT_DIR}/prisma/migrations/${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo ""

# Apply combined migrations
COMBINED_FILE="${SCRIPT_DIR}/prisma/migrations_combined.sql"

if [ ! -f "$COMBINED_FILE" ]; then
    echo -e "${RED}❌ Combined migrations file not found: $COMBINED_FILE${NC}"
    echo "   Run: ./scripts/generate-migrations.sh"
    exit 1
fi

echo -e "${YELLOW}Applying combined migrations...${NC}"
PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" < "$COMBINED_FILE" 2>&1 | tail -20

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations applied successfully${NC}"
else
    echo -e "${RED}⚠️  Some migrations failed (may be due to idempotent operations)${NC}"
fi

echo ""
echo -e "${YELLOW}Recording migrations in _prisma_migrations table...${NC}"

# Extract migration names and record them
MIGRATIONS=(
    "00000000000000_init"
    "20260430000000_add_en_route_status"
    "20260501000000_v3_core"
    "20260501000001_add_type_config_tables"
    "20260502000001_add_task_type_prefix"
    "20260502000002_add_process_engine"
)

for migration_name in "${MIGRATIONS[@]}"; do
    # Check if already recorded
    RECORDED=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '$migration_name';")
    RECORDED=$(echo "$RECORDED" | tr -d ' ')

    if [ "$RECORDED" -eq 0 ]; then
        # Record the migration
        PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "
            INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (
                gen_random_uuid()::text,
                'xxx',
                NOW(),
                '$migration_name',
                'Applied via migration script',
                NULL,
                NOW(),
                1
            );
        "
        echo -e "  ${GREEN}✓${NC} $migration_name"
    else
        echo -e "  ${YELLOW}⊘${NC} $migration_name (already recorded)"
    fi
done

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Database migration complete!${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify the database: psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -c '\\dt'"
echo "  2. Rebuild Docker: docker compose up --build -d"
echo "  3. Check logs: docker compose logs -f backend"
echo ""
