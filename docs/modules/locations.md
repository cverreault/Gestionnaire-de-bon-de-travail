# Module: locations

| Field | Value |
|---|---|
| **Type** | Core (live ops) |
| **Status** | Implemented (B5.1 → B5.5) |
| **Phase** | 3 (B5) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-008](../adrs/ADR-008-gps-tracking-privacy.md) |
| **Owner** | Carl Verreault |

## Purpose

Live GPS positions for opted-in technicians so the dispatcher can see at a glance who is where. Time-series storage capped at 7 days for Loi 25 / PIPEDA compliance (see [ADR-008](../adrs/ADR-008-gps-tracking-privacy.md)).

## Personas servis

| Persona | Usage |
|---|---|
| **TECHNICIAN** | Opt-in toggle in `/profil` → `POST /me/location` while logged in |
| **DISPATCHER, ADMIN** | Map of all opted-in techs on `/dashboard` |
| **SUPER_ADMIN** | Inherits ADMIN — sees the map |

## Capabilities

- **Opt-in by default OFF.** Stored in `User.preferences.gps.enabled`. Defaults absent → false.
- **Server-side gating.** Every position upload re-reads the preference. A stale tab / tampered client cannot keep posting after revocation.
- **Latest-position-per-tech query.** `DISTINCT ON (technician_id) ORDER BY recorded_at DESC` — index-covered, O(N techs) regardless of history depth.
- **15-second polling.** The dispatcher map fetches every 15s while the tab is foreground. WebSocket is out of scope for v1.
- **7-day retention.** Nightly cron at 03:15 UTC deletes rows older than 7 days.
- **Dispatcher map** : OpenStreetMap tiles + Leaflet markers with the tech's initials, auto-fit on first load.

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/me/location` | TECHNICIAN | Record a single position. `{ latitude, longitude, accuracy? }`. 403 if opted out / inactive / wrong role. 60/min rate limit. |
| `GET` | `/api/dispatcher/technicians/positions` | ADMIN, DISPATCHER | Latest position per opted-in active tech. `{ rows: [...] }` |

## Domain events publiés

Aucun en v1.

Future :
- `locations.tech.went-stale` — emitted when an active tech with `gps.enabled=true` hasn't posted a position in N minutes. Useful for the dispatcher (lost connectivity?). Out of scope here.

## Domain events consommés

Aucun.

## Données possédées

### `technician_locations` (Prisma : `TechnicianLocation`)

- `id` (UUID, PK)
- `technicianId` → `users.id` (FK, ON DELETE CASCADE)
- `latitude` (Float, WGS84)
- `longitude` (Float, WGS84)
- `accuracy` (Float?, metres — null when source omitted it)
- `recordedAt` (DateTime, server-side default `now()`)

Indices :
- `idx_technician_locations_tech_recorded` on `(technician_id, recorded_at DESC)` — covers "latest position per tech".
- `idx_technician_locations_recorded_at` on `recorded_at` — covers the nightly retention sweep.

CASCADE on user delete: deactivating a tech removes their history. Aligns with the "least amount of data we still need" stance of ADR-008.

## Convention preferences (shared contract)

```typescript
// common/contracts/gps-preferences.contract.ts
preferences.gps = {
  enabled: true | false
}
```

Default OFF (absent → false). Strict boolean — a stringly-typed `"true"` is not enabled. Helper `isGpsEnabled(prefs)` is the single source of truth for both the backend POST handler and the frontend hook.

## Variables d'environnement requises

Aucune. The module loads unconditionally; if no tech opts in, no rows ever insert.

`THROTTLER_DISABLE=1` (test-only) bypasses the 60/min cap on `POST /me/location`.

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `common/prisma` | hard | Reads users.preferences, writes/reads technician_locations |
| `common/contracts/gps-preferences` | hard | Single source of truth for the opt-in shape |
| `@nestjs/schedule` | npm | Cron for the retention sweep |
| `leaflet` + `react-leaflet@^4` | npm (frontend) | OpenStreetMap rendering. v4 pinned for React 18 peer. |

No cross-module imports. The frontend hook reads from `useUserPreferences()` and posts via its own thin axios wrapper — does not import anything from `users` or `notifications`.

## Tests

- **`locations.service.spec.ts`** : 6 cases — inactive user, non-TECH role, opted-out, missing gps key (default OFF), happy-path insert, raw-SQL → camelCase mapping.
- **`location-retention.service.spec.ts`** : 3 cases — cutoff is exactly now - 7 days, return value matches Prisma's delete count, no-op when nothing matches. Fake timers for determinism.
- **`gps-preferences.contract.spec.ts`** : 5 cases on `isGpsEnabled` — strict boolean, defaults OFF on every malformed shape.
- **`roles-matrix.spec.ts`** : 2 new rows (POST = TECHNICIAN, GET = ADMIN+DISPATCHER).

Total : 16 new cases.

## Open questions

- **Right-of-access export** : a tech may legitimately ask "give me my history". Today there's no endpoint to export their own positions — the 7-day window makes this less acute but not zero. Open in ADR-008.
- **WebSocket push** : 15s polling is fine for v1. If the user base grows, swap for `@nestjs/websockets` and broadcast on each insert. The frontend will need to handle reconnect.
- **Geofencing** : "alert when a tech enters the area of their assigned BT" is a natural follow-up. Out of scope here.
- **Multi-tenancy (B6)** : tenant-level disable will be added in B6 — for collective agreements that forbid tracking. Today the per-user opt-in is the only knob.

## Refs

- B5.1 commit — schema + preferences contract
- B5.2 commit — record + latestPositions endpoints
- B5.3 commit — frontend hook + opt-in UI
- B5.4 commit — Leaflet map on the dispatcher dashboard
- B5.5 commit — 7-day retention cron
- [`docs/adrs/ADR-008-gps-tracking-privacy.md`](../adrs/ADR-008-gps-tracking-privacy.md) — the consent posture
- [`docs/sprints/2026-06-sprint-1-summary.md`](../sprints/2026-06-sprint-1-summary.md) — section "B5 — GPS"
