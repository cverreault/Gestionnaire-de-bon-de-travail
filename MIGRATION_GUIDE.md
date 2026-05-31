# 🚀 TaskMgr Migration & Rebuild Guide

**Current Status:** Migrations prepared, code compiled, ready for deployment
**Issue:** Prisma shadow database error (P3006) when running `prisma migrate dev`
**Solution:** Apply migrations manually, then rebuild Docker

---

## 📋 Prerequisite Checklist

- [ ] PostgreSQL 16+ installed and accessible
- [ ] `psql` command available in terminal
- [ ] Docker & Docker Compose installed
- [ ] Backend code compiled (`npm run build` ✓)
- [ ] Frontend compiled (TypeScript ✓)

---

## 🔧 Step 1: Start Services

```bash
cd ~/projet/taskmgr

# Start PostgreSQL + MinIO (skip if already running)
docker compose up -d postgres minio

# Verify PostgreSQL is ready (wait ~30s for health check)
docker compose ps postgres

# Expected: postgres is running with status "healthy"
```

---

## 🗄️ Step 2: Apply Database Migrations

### Option A: **Automated Script** (Recommended)

```bash
cd ~/projet/taskmgr/backend

# Make script executable
chmod +x scripts/apply-migrations.sh

# Run migration script
./scripts/apply-migrations.sh

# Expected output:
# ✅ Database connection successful
# ✅ Migrations applied successfully
# ✅ Database migration complete!
```

### Option B: **Manual psql** (If script fails)

```bash
cd ~/projet/taskmgr/backend

# Apply all migrations in a single operation
PGPASSWORD="taskmgr_secret" psql \
  -U taskmgr \
  -h localhost \
  -p 5434 \
  -d taskmgr \
  < prisma/migrations_combined.sql

# Check result
PGPASSWORD="taskmgr_secret" psql \
  -U taskmgr \
  -h localhost \
  -p 5434 \
  -d taskmgr \
  -c "SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 6;"
```

---

## ✅ Step 3: Verify Migrations Applied

```bash
# List all tables
docker compose exec postgres psql -U taskmgr -d taskmgr -c "\dt"

# Expected tables:
# - users
# - work_orders
# - task_types (new in v3_core)
# - process_definitions (new in process_engine)
# - process_statuses (new in process_engine)
# - process_transitions (new in process_engine)

# Check enum types
docker compose exec postgres psql -U taskmgr -d taskmgr -c "SELECT typname FROM pg_type WHERE typtype='e';"

# Expected enums:
# - "Role" (ADMIN, DISPATCHER, TECHNICIAN)
# - "WorkOrderStatus" (CREATED, ASSIGNED, ..., EN_ROUTE, ..., COMPLETED_NEGATIVE)
# - "WorkOrderType" (INSTALLATION, REPAIR, ...)
# - "ClientType", "AddressType"
```

---

## 🐳 Step 4: Rebuild & Start Everything

```bash
cd ~/projet/taskmgr

# Rebuild all services (includes migrations on startup)
docker compose up --build -d

# Wait for services to be healthy (~60s)
docker compose ps

# Watch logs (stop with Ctrl+C)
docker compose logs -f backend
```

### Expected logs:
```
backend-1  | [Nest] 12:34:56     LOG [TypeOrmModule] Database connection established
backend-1  | [Nest] 12:34:57     LOG [ProcessSeedService] Seeding default process...
backend-1  | [Nest] 12:34:58     LOG [NestFactory] Application listening on port 3000
```

---

## 🧪 Step 5: Quick Validation

```bash
# Test backend health
curl http://localhost:3800/api/health

# Test frontend (should load)
open http://localhost:3801

# Test API - list work orders
curl -X GET http://localhost:3800/api/work-orders \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check process engine loaded
docker compose exec backend npm run test -- process 2>&1 | head -20
```

---

## ⚠️ Troubleshooting

### Issue: "type WorkOrderStatus does not exist"
- **Cause:** Migrations not applied to database
- **Fix:** Run `./scripts/apply-migrations.sh` again or apply combined SQL manually

### Issue: "Migration `XXX` already applied"
- **Cause:** Idempotent operations (safe to ignore)
- **Fix:** The script is designed to be re-entrant; just continue

### Issue: "Can't reach database server at localhost:5434"
- **Cause:** PostgreSQL container not running
- **Fix:** `docker compose up -d postgres && docker compose logs postgres`

### Issue: Prisma Client generation error
- **Cause:** Schema out of sync
- **Fix:**
  ```bash
  cd backend
  npx prisma generate
  npm run build
  ```

### Issue: Port 5434 already in use
- **Cause:** Another PostgreSQL running
- **Fix:** 
  ```bash
  lsof -i :5434          # Find process
  docker compose down     # Or kill the conflicting process
  docker compose up -d    # Restart
  ```

---

## 📊 Migration Checklist

After rebuild, verify all 6 migrations are applied:

- [ ] `00000000000000_init` — Base tables (users, work_orders, notes, attachments)
- [ ] `20260430000000_add_en_route_status` — EN_ROUTE enum added to WorkOrderStatus
- [ ] `20260501000000_v3_core` — DISPATCHER role, clients, task_types
- [ ] `20260501000001_add_type_config_tables` — Client/Address type configurations
- [ ] `20260502000001_add_task_type_prefix` — prefix column on task_types
- [ ] `20260502000002_add_process_engine` — Process engine (definitions, statuses, transitions)

---

## 🎯 Key Features Now Available

✅ **Process Engine**
- Configurable workflows (statuses, transitions)
- Dynamic badges on work orders
- Admin panel for process configuration
- Side-effects (dispatchedAt, actualStartTime, actualEndTime)

✅ **Role-Based Transitions**
- ADMIN: all transitions
- DISPATCHER: dispatch and assignment transitions  
- TECHNICIAN: status updates on assigned work

✅ **Legacy Compatibility**
- Old enum-based statuses still work
- Automatic backfill of new `currentStepId` field
- Dual-mode badges (legacy or dynamic)

---

## 📝 Next: Test the Process Engine

Once rebuild is complete, open your browser to:

```
http://localhost:3801/parametres/processus
```

You should see the default "Standard BT" process with 7 statuses (0, 100, 200, ..., 600).

---

## 🆘 Still Stuck?

Check these files for more context:
- Backend errors: `docker compose logs backend`
- Database state: `psql` directly connected to PostgreSQL
- Migration history: `SELECT * FROM _prisma_migrations;`
- Schema conflicts: Compare `schema.prisma` with DB using `\d` in psql

---

**Generated:** 2026-05-02  
**Migrations:** 6 total  
**Code Status:** ✅ TypeScript compiled  
**Ready to Deploy:** 🚀 After migrations applied
