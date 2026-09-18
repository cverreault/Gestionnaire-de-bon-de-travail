# ADR-016 — Offline sync protocol: delta pull, idempotent replays, optimistic locking

- **Status**: Accepted (2026-09-18 — lot B37 livré : appareils, push Expo, idempotence, sync delta, GPS par lots, proxy de pièces jointes)
- **Date**: 2026-09-16
- **Deciders**: cverreault
- **Supersedes**: —
- **Amends**: — (builds on the `expectedUpdatedAt` optimistic lock introduced with the process engine)

## Context

The technician app (ADR-014) must work with no signal for hours: read the
day's work orders, move them through their process, add notes, photos,
parts and signatures, then reconcile when the network is back. The PWA's
IndexedDB store showed what *not* to do: a queue with no idempotency key
(a retry after a timeout double-posts), no `expectedUpdatedAt` (replays
are last-write-wins), and no cached process definition (no transition
buttons offline).

What the backend already gives us:
- `POST /work-orders/:id/transition` accepts `expectedUpdatedAt` and
  answers `409 { code: 'OPTIMISTIC_LOCK_CONFLICT', currentUpdatedAt, expectedUpdatedAt }`
  in both the process-engine and legacy paths.
- `GET /processes/:id/snapshot` returns statuses, hydrated transitions
  with `allowedRoles` / `requiredFields`, and an `adjacencyMap` — enough
  to compute available transitions client-side.
- Work orders are never hard-deleted; a technician loses *visibility*
  (reassignment, completion ageing out), which is not deletion.

What it does not give us: any `updatedAt`-since filter, any notion of
« what changed since my last visit », and child mutations (notes,
attachments, parts) do not touch `WorkOrder.updatedAt`, so a parent
timestamp alone would miss them.

## Decisions

### 1. Pull = `GET /api/me/sync?cursor&limit` with a keyset cursor and a full visible-id list

The technician's **visible set** is
`assignedToId = me AND (not completed OR updatedAt > now − 14 days)`.
Each call returns:

- `visibleWorkOrderIds` — the *whole* visible set, every time. It is tens
  of ids; the client deletes local rows that are no longer listed. This
  is how reassignment and ageing-out propagate without tombstones.
- `workOrders[]` — full bodies (client, address with coordinates, task
  type, current step, notes, attachment metadata, parts used, template
  data) only for rows with `(updatedAt, id) > cursor`, ordered by
  `(updatedAt, id)`, `limit + 1` to compute `hasMore`.
- `processSnapshots{}` for the process definitions referenced in the page,
  `partsStock[]` for the technician and the active `partsCatalog[]`, each
  filtered on its own `updatedAt` so unchanged reference data is skipped.
- `cursor` (opaque base64url `{ v, t, id }`), `hasMore`, `serverTime`,
  and `fullResync: true` when the cursor is missing, tampered or older
  than 30 days — the client then wipes its server tables and re-pulls.

**Rejected** because:
- *A change-log / tombstone table fed by domain events* —
  `PATCH /work-orders/:id` emits no event, so edits would be missed, and
  the table is one more thing to keep consistent.
- *`deletedAt` soft deletes* — nothing is deleted; modelling visibility
  loss as deletion lies about the data.
- *Adding `updatedSince` to `GET /work-orders`* — that endpoint is the
  dispatcher grid's paginated list DTO: no children, no snapshots, no
  parts stock. The mobile pull is a composition, and it belongs to the
  `mobile` module, which reads `work_orders`, `process_*` and `parts`
  tables directly — the same documented read-only exception `dashboard`,
  `search` and `reports` already use.

### 2. Child mutations touch the aggregate root

Creating a note, uploading or deleting an attachment, adding or removing
a part, saving signatures: each bumps `work_orders.updated_at` inside the
same transaction, and the response carries `workOrderUpdatedAt`.

Accepted consequence: a dispatcher note written while the technician was
offline makes the technician's queued transition hit a 409. That is the
point — the client sees the new note before deciding, and additive
operations retry automatically (§4).

**Rejected**: OR-ing child timestamps into the pull predicate. It cannot
see an attachment delete, and it makes « the version of a work order »
ambiguous for the optimistic lock.

### 3. Replay safety = an `Idempotency-Key` header per mutating request

Every queued operation carries a client-generated UUID sent as
`Idempotency-Key`. A global interceptor, active only on handlers marked
`@Idempotent()` **and** only when the header is present (the web app is
unaffected), stores `(tenantId, userId, key) → (requestHash, statusCode, body)`
for 48 hours:

- same key, same hash → the stored response is replayed with
  `Idempotency-Replayed: true`;
- same key, different hash → `422 IDEMPOTENCY_KEY_REUSED`;
- key still in flight → `409 IDEMPOTENCY_IN_PROGRESS`;
- a 5xx is not stored, so the client may retry.

Multipart uploads hash method, path, form fields, file size and the first
8 KB of the file. Endpoints marked in v1: transition, notes, signatures,
attachment upload, parts add/remove on a work order, location batch
(ADR-017).

**Rejected**: a `POST /api/me/sync/batch` endpoint. The `mobile` module
cannot call `WorkOrdersService`, `AttachmentsService` or `PartsService`
without four new DI contracts or new dependency-cruiser exceptions; and
atomicity across operations is not even desirable — a rejected photo must
not roll back a completed transition. At this scale (≤ 20 queued ops) a
sequential drain over N requests is fine.

### 4. Conflicts reuse the existing `expectedUpdatedAt` → 409, no server-side merge

The client drains its queue sequentially and feeds each response's
`workOrderUpdatedAt` into the next operation's `expectedUpdatedAt`. On
409 it pulls, then:

- **additive** operations (note, photo, signature, part added) refresh
  `expectedUpdatedAt` and retry, up to three times;
- **transitions** and **part removals** stop in a `CONFLICT` state and
  block later operations on that work order until the technician chooses
  « apply anyway » (re-validated against the fresh `currentStepId`) or
  « discard ».

The server never merges. It has no way to know whether « start work » is
still what the technician means after a reassignment.

### 5. Attachments stay multipart through the API; downloads get a streaming proxy

Uploads keep `POST /work-orders/:id/attachments` (10 MB, MIME allowlist,
magic-bytes check) with an `Idempotency-Key`. Downloads gain
`GET /api/attachments/:id/content`, which streams the object through the
API with the same object-level RBAC as the presigned download.

**Rejected**: presigned PUT/GET to MinIO. On self-hosted installs
`MINIO_ENDPOINT` is usually an internal hostname the phone cannot reach,
and a presigned PUT bypasses the B27 magic-bytes validation unless a
second « finalize » call is added.

### 6. Signatures stay inline on the work order

`signatureClient` / `signatureTechnician` remain PNG data-URLs on the row
(B12). The sync projection replaces them with `hasSignatureClient`,
`hasSignatureTechnician` and `signedAt`; the app fetches
`GET /work-orders/:id` when it needs the image. A signature capture is
a queued operation like any other.

### 7. Available transitions are computed on the device

`resolveAvailableTransitions(snapshot, currentStepId, role)` in
`@taskmgr/shared` filters `snapshot.transitions` by `fromStatusId` and
`allowedRoles`. Because a queued transition is projected onto the local
work order, a technician can chain `EN_ROUTE → IN_PROGRESS → COMPLETED`
offline; the server re-validates each step on replay.

## Not in v1

- Server-side merge, CRDTs.
- A batch endpoint.
- WebSocket / live sync (the app pulls on foreground, reachability, push
  and a foreground timer).
- Creating work orders offline.
- Chunked or resumable uploads; server-generated thumbnails.
