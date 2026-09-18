# ADR-017 — Mobile background GPS: batched upload and client timestamps

- **Status**: Accepted (2026-09-18 — lot B37 livré : appareils, push Expo, idempotence, sync delta, GPS par lots, proxy de pièces jointes)
- **Date**: 2026-09-16
- **Deciders**: cverreault
- **Supersedes**: —
- **Amends**: [ADR-008](ADR-008-gps-tracking-privacy.md) (collection mechanics only; opt-in, 7-day retention, reader scope and storage are unchanged)

## Context

ADR-008 designed position tracking for a browser tab: one fix per
`POST /api/me/location`, throttled at 60 per minute, `recordedAt` set by
the server on insert. The native app (ADR-014) tracks from a background
task that the OS wakes every few minutes with a handful of buffered
fixes, often with no network. Sending them one by one on wake-up drains
the battery and loses the real capture time.

Background tracking is also a stronger privacy statement than a
foreground tab. Loi 25 asks that the consent paragraph describe *what is
collected and how*; « even when the app is closed » has to be named.

## Decisions

### 1. `POST /api/me/locations/batch`, owned by the `locations` module

Body: `{ fixes: [{ latitude, longitude, accuracy?, speed?, heading?, recordedAt, source }] }`,
at most 100 fixes, throttled at 12 requests per minute per user, marked
`@Idempotent()` (ADR-016 §3). The service re-checks
`preferences.gps.enabled` on every call (403 if off, as ADR-008
requires), de-duplicates on `(technicianId, recordedAt)` through a unique
index so a replayed batch is harmless, rejects fixes more than 2 minutes
in the future or older than the 7-day window (they would be purged the
same night), and answers `{ accepted, rejected: [{ index, reason }] }`.

The endpoint lives in `locations`, not `mobile`: it owns the table and
the consent check.

**Rejected** because:
- *Keep one fix per call* — a background wake-up with 8 buffered fixes
  becomes 8 radio round-trips, and the per-minute throttle was sized for
  a foreground tab.
- *WebSocket stream* — no Redis, no fan-out need, and the app is offline
  half the time anyway.

### 2. `technician_locations.source` and client-provided `recordedAt`

New enum column `source`: `WEB | MOBILE_FOREGROUND | MOBILE_BACKGROUND`
(default `WEB` for the existing endpoint). `recordedAt` becomes the
client's capture time, clamped by the rules above.

Three reasons: the consent text can say exactly which mode is active;
the dispatcher map can render a stale background fix differently from a
live one; and the audit question « was the tech on site at 14:10? » needs
the capture time, not the upload time.

### 3. Two independent consents, and a narrow activation rule

- **Server consent**: `preferences.gps.enabled`, unchanged, enforced on
  every batch.
- **OS permission**: the app must not request « Always » location before
  the server flag is on. If the OS permission is « While using », only
  `MOBILE_FOREGROUND` fixes are produced.
- **Activation**: background collection runs only while the technician
  has at least one work order in an active field state
  (`EN_ROUTE` / `IN_PROGRESS` class, computed from the locally projected
  work orders). No active work order, no tracking — this keeps the
  ADR-008 « minimum necessary » claim true when the phone goes home.
- A 403 on the batch endpoint (consent revoked from the web profile)
  stops the background task immediately and is shown in the app's
  profile screen.

### 4. Everything else stays as in ADR-008

Opt-in default OFF, 7-day retention sweep, own Postgres, readers limited
to ADMIN and DISPATCHER, revocation immediate with history purged by the
next sweep.

## Not in v1

- Geofencing (« arrived on site » auto-transition).
- Tenant-level GPS kill switch (still open from ADR-008).
- PIPEDA right-of-access export of a technician's own history (still
  open from ADR-008).
- Motion-based sampling (slower cadence when stationary).
