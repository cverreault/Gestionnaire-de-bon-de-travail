# E2E tests (Playwright) — C5

Four specs:

- `smoke-admin-nav.spec.ts` — login admin + dashboard / work-orders / audit nav (fast canary)
- `workflow-create-assign-transition.spec.ts` — full create → assign → dispatch → tech terminates (slow lifecycle)
- `auth-failure.spec.ts` — wrong password / unknown email both stay on /login with a visible error (anti-enumeration UX)
- `tech-permission-denied.spec.ts` — TECH cannot see admin-only paths (dashboard / users / settings / audit / backup / reports / super-admin) — UI gate matches the backend RBAC

## Setup (once)

```bash
cd frontend
npm install                 # picks up @playwright/test
npm run e2e:install         # downloads chromium-headless-shell (~115 MB)
```

## Run

The Docker stack must be up (`docker compose up -d`). Credentials come from env vars — the suite never resets passwords.

```bash
cd frontend
E2E_BASE_URL=http://localhost:8088 \
E2E_ADMIN_EMAIL=admin@example.com \
E2E_ADMIN_PASSWORD=*** \
E2E_TECH_EMAIL=tech@example.com \
E2E_TECH_PASSWORD=*** \
npm run e2e
```

Without `E2E_TECH_*` the lifecycle + permission-denied specs are skipped — the smoke + auth-failure specs still run on the admin creds alone.

Headed mode (`npm run e2e:ui`) gives the interactive Playwright UI, useful for selector tuning when the markup changes.

## Notes

- The lifecycle spec **does not** clean up the BT it creates. Audit is append-only by design; the BT itself ends up in COMPLETED_POSITIVE. Run on dev / staging only.
- `workers: 1` and `fullyParallel: false` are set in `playwright.config.ts` — we share a single backend / DB.
- Traces and screenshots on failure are kept in `playwright-report/`.
