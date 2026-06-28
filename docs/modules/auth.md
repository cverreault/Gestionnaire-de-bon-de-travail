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

## Capabilities

- Login email+mot de passe, retourne `{ accessToken, refreshToken, user }`
- Vérification bcrypt sur le hash mot de passe (`password` colonne)
- Rotation atomique des refresh tokens — le nouveau token et la révocation de l'ancien sont dans la même transaction
- Détection de replay : un refresh token **déjà révoqué** rejoué → toute la famille est invalidée immédiatement (`workflow attaquant volé + replay légitime`)
- Logout best-effort : révoque le token présenté sans erreur s'il n'existe pas / déjà révoqué
- Register pour l'admin (création d'utilisateur avec bcrypt 10 rounds)
- Énumération de comptes prévenue : même message d'erreur pour « email inconnu » et « mauvais mot de passe »

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

## Domain events publiés

Aucun pour l'instant. (Évolution future possible : `auth.login.success`, `auth.token.replay-detected` consommé par `audit`.)

## Domain events consommés

Aucun.

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

## Open questions

- Faut-il un endpoint admin pour révoquer toutes les sessions d'un utilisateur (`POST /users/:id/revoke-sessions`) ?
- Politique de purge des `refresh_tokens.revokedAt` > 30 jours (cleanup nocturne) ?
- Migrer vers un `JWKS` rotatif au lieu d'un secret statique pour préparer un éventuel multi-tenancy (ADR future).
- Le code C13 émet un log Pino sur refus RBAC. À terme, brancher un domain event pour persistance audit + détection d'attaque côté observabilité.

## Refs
- [ADR-004](../adrs/ADR-004-authentication-authorization.md) — JWT + bcrypt + 3 rôles
- C6 commit `80ed1c4` — rotation DB-backed
- C7 commit `0235e54` — rate limit effectif + scope userId
- C13 commit `e73f446` — log structuré access denied
