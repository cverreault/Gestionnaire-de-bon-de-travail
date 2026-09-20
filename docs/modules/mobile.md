# Module: mobile

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Active — lot B37 livré (appareils, config + porte de version, idempotence, sync delta, push Expo B37.4) ; ADR 014–017 acceptées |
| **Phase** | 4 (B37) |
| **ADR References** | [ADR-014](../adrs/ADR-014-native-mobile-app-platform.md), [ADR-015](../adrs/ADR-015-device-registry-and-native-push.md), [ADR-016](../adrs/ADR-016-mobile-offline-sync-protocol.md), [ADR-017](../adrs/ADR-017-mobile-background-gps.md) |
| **Owner** | Carl Verreault |

## Purpose

Surface backend de l'application mobile native technicien (`mobile/`, React Native + Expo). Le module possède le registre des appareils, l'envoi push natif (Expo Push Service), le stockage des clés d'idempotence et la projection de synchronisation delta que l'app consomme hors ligne. Il ne possède **aucune donnée métier** : il lit les bons de travail, processus et pièces en lecture seule, comme `dashboard`, `search` et `reports`.

C'est un module de surface, au même titre que `portal` (surface client) : il traduit les besoins d'un client non-navigateur (pas d'origine, connectivité intermittente, tokens d'appareil) sans modifier les invariants des modules métier.

## Personas servis

| Persona | Usage |
|---|---|
| **Technicien** | Enregistre son téléphone, reçoit les push natifs, synchronise ses BT du jour et rejoue ses actions hors ligne |
| **Dispatcher** | Aucun usage direct en v1 ; bénéficie des positions GPS en arrière-plan (module `locations`) |
| **Admin** | Voit et révoque ses propres appareils sur `/profil` ; configure `mobile.min-app-version.*` et `mobile.push.enabled` via `system-configs` |

## Capabilities

- Enregistre un appareil par `(tenant, installationId)` et le relie à l'utilisateur connecté (re-liaison si un autre utilisateur se connecte sur le même téléphone)
- Envoie des notifications push natives via Expo Push Service, avec purge des tokens `DeviceNotRegistered` par sondage des receipts
- Fournit à `notifications` une branche device-token via le contrat `MOBILE_PUSH_SENDER` (sans import croisé)
- Révoque un appareil : token push annulé + event `mobile.device.revoked` consommé par `auth` pour révoquer les refresh tokens de cet appareil
- Heartbeat : `lastSeenAt`, `appVersion`, `pushToken`, réponse `{ upgradeRequired }`
- Expose une configuration publique (`/api/mobile/config`) : versions minimales par plateforme, features, limites, branding tenant
- Projection de sync delta : curseur keyset `(updatedAt, id)`, liste complète des BT visibles, snapshots de processus, stock et catalogue de pièces
- Stocke et nettoie (48 h, cron 04:20) les clés d'idempotence utilisées par l'interceptor `@Idempotent()` de `common/` (contrat `IDEMPOTENCY_STORE`, lié ici car le module est `@Global()`). Marqués en v1 : transition, notes, signatures, upload de pièce jointe, ajout / retrait de pièce sur un BT. Sémantique ADR-016 §3 : rejeu → même réponse + `Idempotency-Replayed: true` ; même clé, autre corps → 422 `IDEMPOTENCY_KEY_REUSED` ; en vol → 409 `IDEMPOTENCY_IN_PROGRESS` ; erreur du handler → clé libérée ; réclamation orpheline > 2 min → reprise

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/mobile/config` | `@Public` | Tenant depuis le Host. `{ minAppVersion{ios,android}, latestAppVersion, features, tenant{slug,name,logoUrl}, limits, push{provider}, serverTime, backendVersion }` |
| `PUT` | `/api/me/devices/:installationId` | TECHNICIAN | Enregistre ou met à jour l'appareil ; 400 si `:installationId` ≠ header `X-Device-Id` ; la réponse expose `hasPushToken`, jamais le token |
| `GET` | `/api/me/devices` | TECHNICIAN, DISPATCHER, ADMIN | Mes appareils (self-service) |
| `POST` | `/api/me/devices/:installationId/heartbeat` | TECHNICIAN | Rafraîchit `lastSeenAt`, `appVersion`, `pushToken` ; renvoie `{ upgradeRequired, minAppVersion, latestAppVersion, serverTime }` ; même contrôle d'en-tête que `PUT` |
| `POST` | `/api/me/devices/:installationId/report` | TECHNICIAN | Rapport de diagnostic envoyé depuis le profil de l'app (`{ state, events[≤300], note? }`) ; journalisé côté serveur en une ligne `tag: mobile-report` (`docker logs taskmgr_backend | grep mobile-report`), rien en base ; même contrôle d'en-tête `X-Device-Id` |
| `DELETE` | `/api/me/devices/:installationId` | TECHNICIAN, DISPATCHER, ADMIN | Révoque l'appareil (204) ; émet `mobile.device.revoked` |
| `GET` | `/api/me/sync` | TECHNICIAN | `?cursor&limit(≤200, défaut 50)` → `{ cursor, hasMore, fullResync, serverTime, visibleWorkOrderIds, workOrders[], processSnapshots{}, partsStock[], partsCatalog[] }`. Visible = `assignedToId = moi ET (non terminé OU updatedAt > now − 14 j)`. `processSnapshots` contient toujours les définitions référencées par la page (petites : 8 statuts, 12 transitions) ; `templates{}` les modèles de formulaire (sections + champs avec `viewRoles` / `editRoles` / `requiredRoles`) des types de tâche de la page, pour saisir `templateData` hors ligne ; `partsStock` / `partsCatalog` sont filtrés sur leur propre `updatedAt > curseur` (complets au `fullResync`, catalogue actif seulement). Les signatures sont remplacées par `hasSignatureClient` / `hasSignatureTechnician`. |

RBAC objet : toutes les routes `/me/devices/*` filtrent sur `userId === currentUser.id` et `tenantId` courant ; un `installationId` inconnu ou appartenant à un autre utilisateur renvoie 404 (jamais 403, pour ne pas révéler l'existence).

Endpoints **hors de ce module** mais requis par l'app (voir la [feuille de route](../mobile/roadmap.md)) : `POST /api/me/locations/batch` (`locations`), `GET /api/attachments/:id/content` (`attachments`), décorateur `@Idempotent()` sur transition / notes / signatures / upload / pièces (`common`).

## Domain events publiés

| Event | Quand | Payload |
|---|---|---|
| `mobile.device.registered` | Première inscription d'un `installationId`, re-liaison à un autre utilisateur, ou réinscription après révocation | `{ tenantId, installationId, userId, platform, appVersion, relinked }` |
| `mobile.device.revoked` | `DELETE /api/me/devices/:installationId` | `{ tenantId, installationId, userId, reason: 'user' \| 'admin' }` |

Les deux sont enregistrés par `audit` via le listener wildcard. `mobile.device.revoked` est émis avec `emitAsync` : la révocation des refresh tokens par `auth` est terminée avant la réponse HTTP.

## Domain events consommés

| Event source | Action |
|---|---|
| — | Aucun en v1. Le push silencieux « sync now » sur `workOrders.workOrder.assigned` est hors v1 (ADR-015). |

## Données possédées

### `devices` (Prisma : `Device`)
- `id` UUID PK, `tenantId`
- `installationId` — UUID client (header `X-Device-Id`), unique par tenant
- `userId` — utilisateur actuellement lié (FK `users`, cascade)
- `platform` — `IOS` / `ANDROID`
- `provider` — `EXPO` / `FCM` / `APNS` (v1 : `EXPO` seulement)
- `pushToken?` unique, `pushTokenInvalidatedAt?`
- `appVersion`, `osVersion?`, `model?`, `locale?`
- `lastSeenAt`, `revokedAt?`, timestamps

Indexes : `(tenant_id, installation_id)` unique, `(user_id)`, `(tenant_id)`.

### `idempotency_keys` (Prisma : `IdempotencyKey`)
- `id` UUID PK, `tenantId`, `userId`
- `key` — UUID client (header `Idempotency-Key`)
- `method`, `path`, `requestHash` (sha256)
- `status` — `IN_PROGRESS` / `DONE`, `statusCode?`, `responseBody?` JSONB
- `createdAt`

Indexes : `(tenant_id, user_id, key)` unique, `(created_at)` pour le nettoyage nocturne.

Les deux tables sont ajoutées à `TENANT_SCOPED_MODELS` (`common/prisma/tenant-scope.middleware.ts`) et à la liste TRUNCATE de `backend/test/integration-helpers.ts`.

### Colonnes ajoutées à des tables d'autres modules (migration unique B37.2)
- `refresh_tokens.device_id?` (module `auth`) — posé par `AuthService` depuis le contexte de requête
- `technician_locations.source` + unique `(technician_id, recorded_at)` (module `locations`, ADR-017)
- Index `work_orders(tenant_id, assigned_to_id, updated_at)` (module `work-orders`) — pull de sync

> **Lectures directes documentées** : `mobile.repository.ts` lit `work_orders` (+ notes, attachments, parts used, client, address, task type, current step), `process_definitions` / `process_statuses` / `process_transitions` et `parts` / `technician_part_stocks` **en lecture seule**, avec son propre `select` (pas d'import de `work-order-includes`, qui est une dette documentée). Même exception que `dashboard`, `search`, `reports`. Aucune écriture sur ces tables depuis ce module.

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `users` | hard (données) | `devices.user_id` ; `preferences` (locale, thème, gps) dans la projection |
| `work-orders` | soft (lecture directe) | Projection de sync |
| `process` | soft (lecture directe) | Snapshots de processus pour les transitions hors ligne |
| `parts` | soft (lecture directe) | Stock du technicien et catalogue |
| `notifications` | soft (contrat `MOBILE_PUSH_SENDER`) | `PushChannelService` appelle `sendToUser` en `@Optional()` |
| `auth` | soft (event `mobile.device.revoked`) | Révocation des refresh tokens d'un appareil |
| `system-configs` | soft (contrat `SYSTEM_CONFIG_RESOLVER`) | `mobile.min-app-version.*`, `mobile.push.enabled`, `mobile.expo-access-token` |
| `tenants` | soft (contrat `extractTenantSlug`) | Branding dans `/api/mobile/config` |

Contrats ajoutés dans `backend/src/common/contracts/` : `mobile-push.contract.ts`, `device-context.contract.ts` (`DEVICE_ID_HEADER`, `extractDeviceId`, champ `deviceId` du `RequestContext`), `mobile-events.contract.ts`, `idempotency.contract.ts`, `sync-protocol.contract.ts`.

## Configuration

| Clé system-config | Env fallback | Défaut | Rôle |
|---|---|---|---|
| `mobile.min-app-version.ios` | `MOBILE_MIN_APP_VERSION_IOS` | `0.0.0` | Gate de version iOS |
| `mobile.min-app-version.android` | `MOBILE_MIN_APP_VERSION_ANDROID` | `0.0.0` | Gate de version Android |
| `mobile.latest-app-version` | `MOBILE_LATEST_APP_VERSION` | — | Affichage « mise à jour disponible » |
| `mobile.push.enabled` | `MOBILE_PUSH_ENABLED` | `true` | Opt-out du relais Expo (in-app seulement) |
| `mobile.expo-access-token` | `MOBILE_EXPO_ACCESS_TOKEN` | — | Optionnel, hausse la limite Expo Push |

## Tests

- **Unit** : `application/devices/devices.service.spec.ts` (re-liaison, révocation émet + annule le token, heartbeat semver), `application/push/mobile-push.service.spec.ts` (ignore les appareils révoqués, purge `DeviceNotRegistered`), `infrastructure/expo-push.adapter.spec.ts` (lots de 100, erreurs réseau → false), `application/sync/sync-cursor.spec.ts` (aller-retour, curseur altéré, > 30 j → `fullResync`), `application/sync/sync.service.spec.ts` (prédicat de visibilité, `hasMore`, signatures retirées), `application/config/mobile-config.service.spec.ts`
- **Permissions** : chaque méthode de controller ajoutée à `backend/src/common/guards/roles-matrix.spec.ts`
- **Integration** (Postgres dédié) : `backend/test/mobile-devices.integration-spec.ts` (login avec `X-Device-Id` → `refresh_tokens.device_id` ; révocation → refresh 401 ; second utilisateur sur le même appareil re-lie), `backend/test/mobile-sync.integration-spec.ts` (réassignation sort de `visibleWorkOrderIds` ; note dispatcher bump `updatedAt` ; pagination `limit=1` ; BT terminé > 14 j disparaît ; isolation tenant), `backend/test/idempotency.integration-spec.ts` (replay identique + header ; corps différent → 422 ; isolation par utilisateur et tenant)
- **Arch** : `npm run arch:check` sans nouvelle exception dans `.dependency-cruiser.cjs`

## Open questions

- Faut-il exposer `GET /api/users/:id/devices` à l'ADMIN pour révoquer l'appareil d'un technicien parti ? Hors v1 (ADR-015), à décider à la première demande.
- Fenêtre de grâce sur la rotation du refresh token (une app tuée entre la réponse et l'écriture en SecureStore perd sa session). À traiter dans `auth`, pas ici.
- `GET /api/auth/me` doit renvoyer `preferences` pour que l'app connaisse thème, locale et consentement GPS dès la connexion (pré-requis B38.3).

## Refs
- [ADR-014](../adrs/ADR-014-native-mobile-app-platform.md), [ADR-015](../adrs/ADR-015-device-registry-and-native-push.md), [ADR-016](../adrs/ADR-016-mobile-offline-sync-protocol.md), [ADR-017](../adrs/ADR-017-mobile-background-gps.md)
- [Feuille de route mobile](../mobile/roadmap.md)
- Specs voisines : [notifications](notifications.md), [locations](locations.md), [auth](auth.md), [work-orders](work-orders.md)
