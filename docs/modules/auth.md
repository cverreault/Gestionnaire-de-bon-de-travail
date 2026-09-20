# Module: auth

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Implemented |
| **Phase** | 1 |
| **ADR References** | [ADR-004](../adrs/ADR-004-authentication-authorization.md) |
| **Owner** | Carl Verreault |

## Purpose

Authentification et rotation des sessions. Émet un access token JWT (courte durée) + un refresh token (7 jours) à chaque login, et permet le renouvellement sans réauthentification.

Depuis C6 (juin 2026), le refresh n'est plus en mémoire : chaque token est persisté avec son **hash SHA-256** (pas le brut), associé à une **famille** UUID. La rotation et la détection de replay sont enforced en DB — un token volé devient inutilisable dès qu'un refresh légitime est exécuté.

## Personas servis

| Persona | Usage |
|---|---|
| **Tous** | Login `/auth/login`, refresh `/auth/refresh`, logout `/auth/logout`, lecture de leur propre profil `/auth/me` |
| **Admin** | Création de nouveaux utilisateurs (délégué à `UsersModule` qui utilise `AuthService.register()`) |
| **Super-Admin** | Configuration plateforme via `/api/super-admin/*` (voir [`system-configs.md`](system-configs.md)). Bootstrap automatique via `SUPER_ADMIN_EMAIL` env |

## Hiérarchie des rôles

```
SUPER_ADMIN     ← plateforme : config globale, futurs tenants
   │            └─ hérite implicitement de toutes les permissions ADMIN
   ▼
ADMIN           ← un tenant : clients, BT, processus, paramètres, audit
   ▼
DISPATCHER     ← assignation, suivi du parc, top-bar search
   ▼
TECHNICIAN     ← lecture/édition limitée à ses BT
```

L'héritage `SUPER_ADMIN → ADMIN` est implémenté dans `RolesGuard.canActivate()` (court-circuit si `user.role === SUPER_ADMIN`). **One-way** : un `@Roles(Role.SUPER_ADMIN)` explicite rejette les ADMIN réguliers (utilisé pour les endpoints `/super-admin/configs`).

## Capabilities

- Login email+mot de passe, retourne `{ accessToken, refreshToken, user }`
- Vérification bcrypt sur le hash mot de passe (`password` colonne)
- Rotation atomique des refresh tokens — le nouveau token et la révocation de l'ancien sont dans la même transaction
- Détection de replay : un refresh token **déjà révoqué** rejoué → toute la famille est invalidée immédiatement (`workflow attaquant volé + replay légitime`)
- Logout best-effort : révoque le token présenté sans erreur s'il n'existe pas / déjà révoqué
- Register pour l'admin (création d'utilisateur avec bcrypt 10 rounds)
- Énumération de comptes prévenue : même message d'erreur pour « email inconnu » et « mauvais mot de passe »
- **Bootstrap SUPER_ADMIN** (SA.1.a) : au boot, si aucun SUPER_ADMIN actif n'existe et que `SUPER_ADMIN_EMAIL` est défini, le user correspondant est promu. Idempotent — les redémarrages suivants no-op tant qu'un SA actif existe

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | publique | Authentifie, retourne tokens + user (rate limit 5/60s `@Throttle` + bcrypt) |
| `POST` | `/api/auth/refresh` | publique (token dans le body) | Rotation : révoque l'ancien, émet un nouveau dans la même famille |
| `POST` | `/api/auth/logout` | authentifiée | Révoque le refresh token présenté (idempotent) |
| `GET` | `/api/auth/me` | authentifiée | Profil utilisateur courant |

Sécurité opérationnelle :

- `JwtAuthGuard` registered `APP_GUARD` — toute route non-`@Public()` exige un access token valide
- `UserScopedThrottlerGuard` (C7) — rate limit scopé `user:<id>` après auth, `ip:<addr>` sinon
- `RolesGuard` (C13) — émet `security.access.denied` (warn Pino) sur tout refus

## Connexion depuis l'hôte principal (apex / www) — hôte implicite

Le tenant est normalement résolu par le sous-domaine (ADR-009). Sur un hôte implicite (`dispatch2go.com`, `www.`, `localhost`, IP), le middleware résout le tenant DEFAULT et le tenant-scope Prisma masquerait les lignes des autres tenants : un utilisateur d'un autre espace ne pouvait pas se connecter (401 « Email ou mot de passe invalide » même avec le bon mot de passe — incident Kevin / Norda, 2026-09-18, aucun DNS `norda.dispatch2go.com`).

Depuis, les flux d'auth basculent dans le contexte du tenant porté par la **credential** (`AuthService.inTenant` → `RequestContextService.runWith`) :

- `login` : si l'email n'existe pas dans le tenant de l'hôte **et** que l'hôte est implicite (`TENANT_IS_IMPLICIT_KEY`), recherche brute (`$queryRawUnsafe`, hors tenant-scope) de l'email parmi les comptes actifs de tenants actifs ; **exactement un** résultat → connexion dans ce tenant ; plusieurs → 401 (l'email doit passer par son sous-domaine, avertissement journalisé).
- `refresh`, `logout`, `login/2fa` : le claim `tenantId` du token (signature vérifiée) fixe le contexte avant toute lecture ou écriture de `refresh_tokens` / `users`.

Sur un sous-domaine explicite, rien ne change : pas de recherche cross-tenant. Le `JwtAuthGuard` continue de faire confiance au tenant du JWT sur les hôtes implicites (comportement préexistant).

## Domain events publiés

Aucun pour l'instant. (Évolution future possible : `auth.login.success`, `auth.token.replay-detected` consommé par `audit`.)

## Domain events consommés

| Event source | Action |
|---|---|
| `mobile.device.revoked` (module `mobile`, B37.3) | `DeviceRevokedListener` révoque tous les refresh tokens dont `device_id` = `installationId` pour cet utilisateur ; émis avec `emitAsync`, donc terminé avant la réponse du `DELETE /api/me/devices/:id` |

`refresh_tokens.device_id` est posé par `AuthService.generateTokens` depuis `RequestContext.deviceId` (en-tête `X-Device-Id`, rempli par `TenantResolverMiddleware`) ; null pour le web.

## Données possédées

- `users` (Prisma : `User`)
  - `id`, `email`, `password` (bcrypt hash), `firstName`, `lastName`, `role` (`ADMIN`/`DISPATCHER`/`TECHNICIAN`), `isActive`, `phone`, `preferences` (JSONB), timestamps
- `refresh_tokens` (Prisma : `RefreshToken`) — introduit par C6
  - `id`, `tokenHash` (SHA-256 hex, unique), `userId`, `family` (UUID partagé entre les rotations d'une même session), `createdAt`, `expiresAt`, `revokedAt` (nullable)
  - Indexes : `(user_id)`, `(family)`, `(expires_at)`

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `users` | partage de modèle | `User` est utilisé par toute la plateforme — `AuthService` est le seul endroit qui écrit dessus avec un bcrypt hash |
| `common/guards` | hard | `JwtAuthGuard`, `RolesGuard`, `UserScopedThrottlerGuard` sont chargés en APP_GUARD au boot |
| `common/events/security-events.ts` | hard | `RolesGuard` émet `security.access.denied` sur refus — consommé par le module `audit` |

## Jobs nocturnes

| Service | Cron | Action |
|---|---|---|
| `RefreshTokenCleanupService` | `0 3 * * *` (3h00 locale) | Purge des `refresh_tokens` dont `revokedAt` OU `expiresAt` est plus vieux que 30 jours. La fenêtre courte minimise la surface si la DB fuite, sans empêcher la détection de replay |

## Tests

- **Unit** : `auth.service.spec.ts` (12 tests : login + refresh + logout) ; `refresh-token-cleanup.service.spec.ts` (4 tests : purge selon âge + résistance aux erreurs DB).
- **Guards** : `roles.guard.spec.ts` (5 tests : allow / deny + log + emit event / anonyme / no-emitter) ; `roles-matrix.spec.ts` (44 assertions de matrice).

## Révocation admin des sessions

`POST /users/:id/revoke-sessions` (ADMIN, module `users`) émet `users.user.sessionsRevoked` avec `emitAsync` ; `auth` (`UserSessionsRevokedListener`) révoque tous les refresh tokens vivants de l'utilisateur, `mobile` révoque ses appareils (chacun réémet `mobile.device.revoked`, déjà consommé ici). La réponse porte les compteurs `{ refreshTokens, devices }`. Le même événement est émis quand un admin désactive un compte (`PATCH /users/:id` avec `isActive=false`, `DELETE /users/:id`). Les access tokens déjà émis restent valides jusqu'à leur expiration (15 min) : pas de liste noire côté JWT.

## Open questions

- Politique de purge des `refresh_tokens.revokedAt` > 30 jours (cleanup nocturne) ?
- Migrer vers un `JWKS` rotatif au lieu d'un secret statique pour préparer un éventuel multi-tenancy (ADR future).
- Le code C13 émet un log Pino sur refus RBAC. À terme, brancher un domain event pour persistance audit + détection d'attaque côté observabilité.

## Refs
- [ADR-004](../adrs/ADR-004-authentication-authorization.md) — JWT + bcrypt + 3 rôles
- C6 commit `80ed1c4` — rotation DB-backed
- C7 commit `0235e54` — rate limit effectif + scope userId
- C13 commit `e73f446` — log structuré access denied
