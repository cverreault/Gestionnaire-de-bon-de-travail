# ADR-014 — Native mobile app: React Native + Expo, monorepo, workspace-URL tenant entry

- **Status**: Proposed
- **Date**: 2026-09-16
- **Deciders**: cverreault
- **Supersedes**: —
- **Amends**: [ADR-002](ADR-002-tech-stack-selection.md) (the « Compatible mobile/tablette (PWA) » constraint and the « un seul SPA React » line)

## Context

ADR-002 committed to a single React PWA for every persona, with
technicians using it from a phone or tablet. That PWA now ships a service
worker, Web Push, an IndexedDB cache and a browser GPS hook — and it hits
the ceiling of what a browser allows on a job site:

- **No background location.** `watchPosition` stops the moment the tab is
  backgrounded or the phone locks. The dispatcher map goes blind exactly
  when the tech is driving.
- **No push on iOS without a native shell** that we control; Web Push on
  iOS is restricted to home-screen installs and is unreliable.
- **Offline is read-mostly.** Only notes are queued; transitions are
  silently paused, available transitions are not cached, photos are
  blocked, and no `expectedUpdatedAt` is ever sent so replays are
  last-write-wins.
- **No signature capture for the technician** (the pad only mounts on the
  admin detail page), no barcode scanning for parts, no camera pipeline
  with compression.

The user's requirement is explicit: iOS and Android, and *not* a WebView
replica of the site — an app designed around field work (offline first,
GPS, camera, push). B37 is the backend contract, B38 the app itself.

## Decisions

### 1. React Native + Expo (managed workflow, dev client, EAS Build)

The app is published as **Dispatch2Go** (bundle id `com.dispatch2go.app` on
both stores, URL scheme `dispatch2go://`); TaskMgr stays the internal code
name.

One TypeScript codebase for iOS and Android, built with Expo's managed
workflow plus `expo-dev-client` so the config plugins we need (background
location, camera, notifications, SQLite, secure store) work without
committing `ios/` or `android/`. Builds and store submission go through
EAS.

**Rejected** because:
- *Keep the PWA only* — cannot deliver background GPS, APNs push, a
  reliable offline queue or a native camera/barcode pipeline. It stays the
  right tool for admin and dispatcher.
- *Flutter* — second language (Dart) for a single-developer TypeScript
  shop; zero reuse of the domain types, API services and locales that
  already exist in `frontend/`.
- *Capacitor around the existing SPA* — still a WebView: background
  location and offline SQLite are plugin-quality, and the SPA's UX is
  built for a dispatcher grid, not a technician's thumb.
- *Kotlin + Swift* — two codebases and two skill sets to maintain for the
  same single developer.

### 2. Same repository: `mobile/` + `packages/shared/`, narrow npm workspaces

The app lives at `mobile/`, next to `backend/` and `frontend/`. A
`packages/shared/` package (`@taskmgr/shared`) holds what is UI-free and
mobile-facing: domain types, the mobile API contract types, pure helpers
(address formatting, labels, date formatting with an explicit locale),
the pure `resolveAvailableTransitions` / `projectWorkOrder` functions and
the technician locale namespaces.

A root `package.json` declares `workspaces: ["mobile", "packages/*"]` —
**and nothing else**. `backend/`, `frontend/` and `e2e/` keep their own
`package.json` and lockfile, untouched.

Two rules follow:
- **The backend never imports `packages/shared`.** The API contract stays
  server-defined in `backend/src/common/contracts/`; the shared package
  mirrors it by hand. This keeps the backend Docker image self-contained.
- **The frontend migrates to `@taskmgr/shared` later** (B38.12). Its Docker
  build context is `./frontend`, so importing `../packages/shared` would
  break `docker compose build` today. Until then the technician locales
  and helpers are *copied*, and the duplication is explicit.

**Rejected** because:
- *Separate repository* — a backend endpoint and the app screen that
  consumes it would land in two PRs with two CIs, and the ADRs that
  constrain the backend (this one, 015, 016, 017) would live away from the
  code they govern. Types and locales would drift.
- *Workspaces covering backend and frontend too* — both Dockerfiles run
  `npm ci` inside their folder against their own lockfile; hoisting to a
  root lockfile breaks them. The frontend also pins React 18 while current
  Expo SDKs require React 19; one hoisted tree would resolve the wrong
  React under Metro.
- *Publishing `@taskmgr/shared` to a registry* — release ceremony for a
  package with one consumer.

### 3. Tenant entry = workspace URL, validated by the existing branding endpoint

Tenant resolution is Host-based (`extractTenantSlug` in
`common/contracts/tenant-context.contract.ts`; ADR-009). A native app has
no origin, so the first screen asks for a **workspace**:

- a slug on the SaaS domain → the app composes
  `https://<slug>.<SAAS_DOMAIN>`;
- a full URL for self-hosted installs (`https://taskmgr.acme.local`,
  which resolves to the DEFAULT tenant like the web does);
- a QR code that encodes that same URL, generated client-side on the web
  profile page (no backend).

Since 2026-09-18 the auth flows also work on an implicit host (apex /
`www`) when the email exists in exactly one tenant — the app may therefore
offer the apex as a default workspace and only ask for a slug when the
login answers that the email is ambiguous. The app validates the workspace with the already-public
`GET /api/tenants/branding` and shows the tenant name and logo before the
login form. `JwtAuthGuard`'s anti-spoof check (JWT `tenantId` must match
the host-pinned tenant), per-tenant email uniqueness and the tenant-scope
Prisma middleware all stay exactly as they are.

**Rejected** because:
- *`X-Tenant-Slug` header* — a second resolution path inside a
  security-critical middleware, which needs its own anti-spoof rule in
  `JwtAuthGuard`, and it does nothing for self-hosted installs that have
  no slug.
- *Public « resolve my workspace from my email » endpoint* — tenant
  enumeration, and it contradicts B6.3 where the same email legitimately
  exists in several tenants.
- *Full URL only, no slug shortcut* — hostile onboarding on the SaaS
  path.

### 4. `X-Device-Id`: a client-generated installation id on every request

The app generates a UUID on first launch, persists it in secure storage
and sends it as `X-Device-Id` on every request. Auth stores it on the
refresh-token row so a device can be revoked as a unit (ADR-015); the
`mobile` module keys its device registry on it.

The header is **client-asserted** and is never used for authorization —
only to scope revocation and telemetry. It is not added to the CORS
`allowedHeaders` list: native clients are not subject to CORS and the
web app does not send it.

### 5. The app consumes the internal JWT API, not the public key-based API

The app talks to the same `/api/*` endpoints as the web app, with a
bearer JWT. Mobile-specific endpoints live under `/api/mobile/*` (public
config) and `/api/me/*` (devices, sync, location batch). The `/api/v1`
public API (ADR-011) is tenant-scoped through an API key: it has no
per-technician identity, no `/me/*` surface, and shipping a long-lived key
inside an app binary is a non-starter.

**Rejected**: a separate versioned `/api/m/v1` surface — double
maintenance for a client we ship ourselves. If a breaking change ever
lands, the min-app-version gate (ADR-015 §5) is the lever, not a second
API.

## Not in v1

- Dispatcher or admin personas on mobile; tablet-specific layouts.
- Creating work orders from the app; editing template custom fields.
- SSO / enterprise login.
- The web frontend consuming `@taskmgr/shared` (B38.12).
- Universal links / App Links across wildcard tenant subdomains (needs
  AASA and `assetlinks.json` served by nginx on every subdomain); v1 uses
  the custom `dispatch2go://` scheme only.
- EAS builds in CI (paid minutes); builds are triggered manually.
