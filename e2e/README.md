# TaskMgr E2E (Playwright)

Smoke + user-journey tests that run against a **live** stack.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
# Browser-based tests also need Chromium's system libraries :
sudo npx playwright install-deps chromium
```

The current smoke suite is request-only (no browser launch) so it runs
even without the system deps. Install them before adding `page.goto()`
journey tests.

## Run

Ensure the app is up (`docker compose up -d` from repo root), then :

```bash
# Local dev
npx playwright test

# Against another URL
BASE_URL=http://172.16.45.125:8088 npx playwright test

# One test file, headed browser
npx playwright test tests/smoke.spec.ts --headed
```

## What's in here

| File | Coverage |
|---|---|
| `tests/smoke.spec.ts` | Public HTTP surface, 401 gates, SPA serves |

## Add a new test

Copy `tests/smoke.spec.ts` as a starting point. Each `test.describe` should
target one flow (login, WO create, dispatch…). Keep them **independent** —
no cross-test shared state so any subset can run alone.

## CI

`retries: 2` when `CI=1`, otherwise 0. Add to your pipeline once you're
happy with the local pass.
