# Module: reports

| Field | Value |
|---|---|
| **Type** | Core (analytics + export) |
| **Status** | Implemented (B3.1 → B3.6) |
| **Phase** | 3 (B3) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md) |
| **Owner** | Carl Verreault |

## Purpose

PDF generation + advanced KPIs. Complementary to (not replacing) `dashboard`: where dashboard exposes snapshots and per-user workload, `reports` answers analytics questions ("avg resolution time per type", "success rate", "SLA breach rate", "throughput trend") and produces standalone artifacts (per-work-order PDF, monthly executive PDF) for printing, emailing, or archiving.

## Personas servis

| Persona | Usage |
|---|---|
| **ADMIN, DISPATCHER** | Page `/rapports` (KPIs + date picker), download per-WO PDF, download monthly report |
| **TECHNICIAN** | Download PDF of their own work orders only — IDOR-checked |
| **SUPER_ADMIN** | Inherits ADMIN access via `RolesGuard` |

## Capabilities

- **Per-WO PDF** : `GET /reports/work-orders/:id/pdf` → fiche d'intervention bilingue (fr/en).
- **Monthly executive PDF** : `GET /reports/monthly/:year/:month/pdf` → 4-tile summary + 3 type-broken-down tables.
- **KPIs** : 4 endpoints under `/reports/kpis/*` — resolution time (avg + median), completion outcome (positive/negative + success rate), SLA compliance (tracked + breached + rate), daily throughput (created + completed bar pairs).
- **Capability probe** : `GET /reports/capabilities` → `{ pdfAvailable: boolean }` so the UI can hide download buttons gracefully when Chromium is missing (dev hosts).
- **Graceful degradation** : if `PUPPETEER_EXECUTABLE_PATH` doesn't resolve to a binary, the module still boots but every `render()` call throws an explicit error.

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/reports/capabilities` | ADMIN, DISPATCHER, TECHNICIAN | `{ pdfAvailable: boolean }` |
| `GET` | `/api/reports/work-orders/:id/pdf` | ADMIN, DISPATCHER, TECHNICIAN | Per-WO PDF. TECH limited to own WOs (IDOR). `?locale=fr\|en` |
| `GET` | `/api/reports/kpis/resolution-time` | ADMIN, DISPATCHER | Avg + median resolution time per task type. `?from&to` |
| `GET` | `/api/reports/kpis/completion-outcome` | ADMIN, DISPATCHER | Positive vs negative completions + success rate. `?from&to` |
| `GET` | `/api/reports/kpis/sla` | ADMIN, DISPATCHER | Tracked vs breached + breach rate. `?from&to` |
| `GET` | `/api/reports/kpis/throughput` | ADMIN, DISPATCHER | Daily created + completed buckets. `?from&to` |
| `GET` | `/api/reports/monthly/:year/:month/pdf` | ADMIN, DISPATCHER | Monthly executive PDF. `?locale=fr\|en` |

Defaults : when `from`/`to` are omitted, the service uses the last 30 days ending now, midnight-UTC aligned.

## Domain events publiés

Aucun.

Future : `reports.monthlyReport.generated` (event with period + buffer pointer) — deferred until email distribution lands.

## Domain events consommés

Aucun.

## Données possédées

Aucune table propre. Lit depuis :

- `work_orders` (incl. `taskType`, `clientAddress_rel`, `assignedTo`, `client`, `notes`, `attachments`, `currentStep`)
- `task_types` (pour les noms dans les KPIs)

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `common/prisma` | hard | Toutes les queries |
| `puppeteer-core` | npm | Headless Chromium driver |
| Chromium system binary | OS | Installé par le Dockerfile prod stage (`apk add chromium`) |

Aucun import direct depuis un autre module métier. Le include block Prisma pour la fiche d'intervention est **redéfini localement** (pas réutilisé depuis `work-orders`) pour respecter la règle no-cross-module-import — le coût en duplication est ~30 lignes, acceptable vs. l'inversion d'architecture.

## Format PDF

Both PDFs use the same wrapper :
- A4 portrait, margins 20mm / 20mm / 15mm / 15mm.
- Inline CSS, no external assets (so Chromium renders the same in any environment).
- Fonts : `-apple-system, "Segoe UI", "Noto Sans", sans-serif` — Noto fonts shipped with the Docker image cover the Unicode range needed for FR + EN.
- Tagged template literal renderer with `esc()` on every interpolation — XSS defense even though data is internal.

## Variables d'environnement requises

```bash
# Set by the Dockerfile prod stage. Override only if you bring your own Chromium.
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

For local dev outside Docker, install Chromium (`brew install --cask chromium` on macOS, `apt-get install chromium` on Debian) and set the path accordingly. Otherwise `isAvailable()` returns `false` and the UI hides the download buttons.

## Tests

- **Template renderers** : 14 cases total — 7 per template (escaping, locale switching, conditional sections, SLA-breach highlighting, empty-state rows).
- **KpiService** : 11 cases (default range, parseRange, completion outcome with success rate, SLA breach rate, raw-SQL passthrough for resolution time and throughput, bigint conversion).
- **Smoke** : backend boot maps all 7 routes (`Mapped {/api/reports/...}` log lines).

Intégration avec une vraie DB / vrai Chromium : pas de spec automatique aujourd'hui — le `/reports/capabilities` endpoint vérifie au moins la présence du binaire en prod.

## Open questions

- **Email distribution mensuelle** : nécessite extension du contrat `INotificationChannel` pour supporter les attachments, ou un mediator dans `common/contracts`. Différé.
- **Charts interactifs** : reach for recharts si l'utilisateur demande zoom, tooltip riches, drill-down. Aujourd'hui : tables + barres CSS inline.
- **Persistance des rapports générés** : aucun stockage actuellement (chaque appel re-rend). Si on monte un cron, on aura besoin de MinIO ou de la même base via `attachments` (cross-module import, à éviter — préférer une table `reports.report_artifacts` propre au module).
- **Pagination des résultats KPI** : pas de limite aujourd'hui (les groupBy par taskType retournent O(types) lignes — borné par config admin, OK).
- **Format dates dans le PDF** : `Intl.DateTimeFormat` avec locale `fr-CA` / `en-CA`. Les autres locales canadiens ne sont pas supportées (volontairement — il faudrait l'aligner avec `nestjs-i18n` plus tard).

## Refs

- B3.1 commit — module + Dockerfile + puppeteer-core
- B3.3 commit — per-WO PDF endpoint + template
- B3.4 commit — KPI service + 4 endpoints
- B3.5 commit — `/rapports` page + axios service
- B3.6 commit — monthly report PDF endpoint + template
- [`docs/sprints/2026-06-sprint-1-summary.md`](../sprints/2026-06-sprint-1-summary.md) — section "B3 — Rapports & KPIs avancés"
