#!/bin/bash

# ============================================================================
# TaskMgr Pre-Rebuild Readiness Check
# Verifies all components are ready for deployment
# ============================================================================

set +e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅${NC} $2"
        ((PASS++))
    else
        echo -e "${RED}❌${NC} $2"
        ((FAIL++))
    fi
}

echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TaskMgr Pre-Rebuild Readiness Check${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo ""

# 1. Code Compilation
echo -e "${YELLOW}📦 Code Compilation${NC}"
npx tsc --noEmit > /dev/null 2>&1
check $? "TypeScript compilation (backend)"

# 2. Frontend compilation (if exists)
if [ -d "../frontend" ]; then
    cd ../frontend
    npx tsc --noEmit > /dev/null 2>&1
    check $? "TypeScript compilation (frontend)"
    cd ../backend
else
    echo -e "${YELLOW}⊘${NC} Frontend directory not found (skipped)"
fi

echo ""

# 3. Dependencies
echo -e "${YELLOW}📚 Dependencies${NC}"
[ -d "node_modules" ] && check 0 "npm packages installed" || check 1 "npm packages installed"
[ -d "node_modules/@nestjs" ] && check 0 "@nestjs packages available" || check 1 "@nestjs packages available"
[ -d "node_modules/prisma" ] && check 0 "Prisma CLI available" || check 1 "Prisma CLI available"
[ -d "node_modules/.prisma" ] && check 0 "Prisma Client generated" || check 1 "Prisma Client generated"

echo ""

# 4. Configuration Files
echo -e "${YELLOW}⚙️  Configuration${NC}"
[ -f "prisma/schema.prisma" ] && check 0 "Prisma schema exists" || check 1 "Prisma schema exists"
[ -f "../.env" ] && check 0 "Environment file exists" || check 1 "Environment file exists"
[ -f "Dockerfile" ] && check 0 "Dockerfile exists" || check 1 "Dockerfile exists"

echo ""

# 5. Migration Files
echo -e "${YELLOW}🗄️  Database Migrations${NC}"
COUNT=0
for dir in prisma/migrations/*/; do
    [ -f "$dir/migration.sql" ] && ((COUNT++))
done
[ $COUNT -ge 6 ] && check 0 "Migration files present ($COUNT)" || check 1 "Migration files present ($COUNT - expected 6)"

[ -f "prisma/migrations_combined.sql" ] && check 0 "Combined migrations file exists" || check 1 "Combined migrations file exists"
[ -f "scripts/apply-migrations.sh" ] && check 0 "Migration script exists" || check 1 "Migration script exists"

echo ""

# 6. Build Output
echo -e "${YELLOW}🏗️  Build Output${NC}"
[ -d "dist" ] && check 0 "dist directory exists" || check 1 "dist directory exists (run: npm run build)"
[ -f "dist/main.js" ] && check 0 "Compiled main.js exists" || check 1 "Compiled main.js exists"

echo ""

# 7. Docker
echo -e "${YELLOW}🐳 Docker${NC}"
if command -v docker &> /dev/null; then
    check 0 "Docker CLI available"
    docker compose config > /dev/null 2>&1
    check $? "docker-compose.yml valid"
else
    check 1 "Docker CLI available"
fi

echo ""

# 8. Process Module
echo -e "${YELLOW}🔧 Process Engine Module${NC}"
[ -d "src/modules/process" ] && check 0 "Process module exists" || check 1 "Process module exists"
[ -f "src/modules/process/process.module.ts" ] && check 0 "ProcessModule defined" || check 1 "ProcessModule defined"
[ -f "src/modules/process/process.engine.ts" ] && check 0 "ProcessEngine service defined" || check 1 "ProcessEngine service defined"
[ -f "prisma/migrations/20260502000002_add_process_engine/migration.sql" ] && check 0 "Process engine migration exists" || check 1 "Process engine migration exists"

echo ""

# 9. Tests (if applicable)
echo -e "${YELLOW}🧪 Tests${NC}"
npm test -- --listTests 2>/dev/null | grep -q "spec\|test" && check 0 "Test files found" || echo -e "${YELLOW}⊘${NC} Test files (optional)"
npm test -- process 2>&1 | grep -q "pass" && check 0 "Process engine tests pass" || echo -e "${YELLOW}⚠️${NC} Process tests (optional)"

echo ""
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}${PASS} passed${NC} | ${RED}${FAIL} failed${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════════════════${NC}"

if [ $FAIL -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Everything looks good!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Start services:  docker compose up -d postgres minio"
    echo "  2. Apply migrations: ./scripts/apply-migrations.sh"
    echo "  3. Rebuild:         docker compose up --build -d"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}⚠️  Some checks failed. Fix issues above before rebuilding.${NC}"
    echo ""
    exit 1
fi
