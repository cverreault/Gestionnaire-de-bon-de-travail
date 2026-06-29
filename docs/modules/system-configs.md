# Module: system-configs

| Field | Value |
|---|---|
| **Type** | Core (cross-cutting infrastructure) |
| **Status** | Implemented |
| **Phase** | 3 (SA) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-004](../adrs/ADR-004-authentication-authorization.md) |
| **Owner** | Carl Verreault |

## Purpose

Runtime key/value configuration store, gated to `SUPER_ADMIN`. Lets a platform operator override what would otherwise be hardcoded in `.env` (SMTP, VAPID, Sentry DSN, retention thresholds…) without redeploying.

Sister to but distinct from the `audit` and `notifications` modules: those react to business events; this one is the platform-level control plane.

## Personas servis

| Persona | Usage |
|---|---|
| **SUPER_ADMIN** | Seul à pouvoir lire / écrire / supprimer une config via `/super-admin/configs`. Modifie SMTP, VAPID, Sentry, retention audit en live |
| **ADMIN, DISPATCHER, TECHNICIAN** | Aucun accès direct — les consommateurs (EmailChannel, PushChannel…) lisent via le module mais ne touchent jamais aux endpoints |

## Capabilities

- Stockage key/value typé string (clé arbitraire, valeur libre)
- **Resolver hiérarchique** : `resolve(key)` retourne le premier non-vide entre :
  1. `system_configs` (DB row)
  2. `process.env[envKeyFor(key)]` (env var dérivée mécaniquement)
  3. `undefined`
- Chiffrement AES-256-GCM des secrets : `set(key, value, { encrypted: true })` chiffre avant insert ; `get(key)` déchiffre transparent à la lecture
- Clé maître `CONFIG_MASTER_KEY` lue depuis l'env au boot, SHA-256-derived vers 32 bytes
- Sans clé maître : les writes chiffrés sont refusés explicitement, les rows plain continuent de servir (rétro-compatibilité)
- Événement `systemConfigs.config.changed` émis sur chaque PUT / DELETE → consommateurs (PushChannel, futurs) rafraîchissent leur état sans restart
- `list()` renvoie les métadonnées sans jamais exposer les valeurs (sécurité)
- Bootstrap du SUPER_ADMIN via `SUPER_ADMIN_EMAIL` env (dans `auth` module — voir `auth.md`)

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/super-admin/configs` | SUPER_ADMIN | Liste les configs (métadonnées seules, jamais la valeur) + `encryptionAvailable: boolean` |
| `GET` | `/api/super-admin/configs/:key` | SUPER_ADMIN | Résout la valeur (DB > env, déchiffrée si chiffrée) — 404 si absent partout |
| `PUT` | `/api/super-admin/configs/:key` | SUPER_ADMIN | Upsert avec `{ value, encrypted? }`. Refuse `encrypted=true` sans `CONFIG_MASTER_KEY` |
| `DELETE` | `/api/super-admin/configs/:key` | SUPER_ADMIN | Supprime la row — env fallback resume |

RBAC strict : même si `RolesGuard` traite `SUPER_ADMIN` comme un tier au-dessus d'`ADMIN`, le `@Roles(SUPER_ADMIN)` explicite ici **garde les ADMIN réguliers OUT** — l'héritage est one-way.

## Domain events publiés

| Event | Quand | Payload |
|---|---|---|
| `systemConfigs.config.changed` | Tout PUT ou DELETE réussi | `{ key }` — `aggregateId` = la clé, `actorUserId` = le SA qui a fait l'action |

Consommateurs actuels :
- `PushChannelService` — rafraîchit `web-push.setVapidDetails()` si la clé commence par `vapid.`

## Domain events consommés

Aucun.

## Données possédées

### `system_configs` (Prisma : `SystemConfig`)
- `key` (String, PK) — ex: `smtp.host`, `vapid.public-key`, `audit.retention-days`
- `value` (Text) — UTF-8 brut OU ciphertext si `encrypted=true`
- `encrypted` (Boolean, default false)
- `updatedBy` (String?) — userId du SA
- `updatedAt` (DateTime, @updatedAt)
- `createdAt` (DateTime, default now)

Pas d'index secondaire — la PK suffit. Volume attendu : < 50 rows.

## Convention de nommage des clés

| Format clé | Env var équivalent | Notes |
|---|---|---|
| `smtp.host` | `SMTP_HOST` | dot → `_`, uppercase |
| `vapid.public-key` | `VAPID_PUBLIC_KEY` | kebab → `_` |
| `audit.retentionDays` | `AUDIT_RETENTION_DAYS` | camelCase → `_` (snake) |
| `notifications.from` | `NOTIFICATIONS_FROM` | |

`envKeyFor(key)` fait la translation. Les consommateurs peuvent overrider avec un nom custom : `resolve('something.else', 'CUSTOM_ENV_NAME')`.

## Format de chiffrement

`AES-256-GCM` avec IV aléatoire de 12 bytes (96 bits) par chiffrement et auth tag de 16 bytes :

```
${ivHex}:${authTagHex}:${ciphertextHex}
```

Sépraté par `:` pour grep-ability dans un dump DB (on distingue facilement les rows chiffrées : trois groupes hex séparés par colons).

Une rotation de `CONFIG_MASTER_KEY` rend toutes les valeurs chiffrées illisibles — à traiter comme `JWT_SECRET`. Pas de KDF/iteration côté impl : c'est une clé maître, pas un mot de passe utilisateur.

## Variables d'environnement requises

```bash
# Optional — sans ça, les rows chiffrées sont illisibles
# (mais le module fonctionne en mode plaintext)
CONFIG_MASTER_KEY=<openssl rand -hex 32>

# Optional — bootstrap du SUPER_ADMIN au boot
SUPER_ADMIN_EMAIL=admin@yourdomain.com
```

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `auth` | hard | `Role.SUPER_ADMIN`, `SuperAdminBootstrapService` — bien que le rôle ait pu vivre dans `common/`, on le garde avec le reste de l'auth pour simplifier |
| `common/contracts` | hard | `IDomainEvent` |
| `common/crypto` | hard | helpers `aes-gcm` (locaux au repo, no npm dep) |

Tous les consommateurs (`EmailChannelService`, `PushChannelService`, etc.) importent `SystemConfigService` directement — c'est un service infrastructure, l'import est explicite et tracé par dependency-cruiser.

## Tests

- **Unit** : `aes-gcm.spec.ts` (9 cases : round-trip, IV unique, mauvaise clé, ciphertext tamper, malformed, key length), `system-config.service.spec.ts` (13 cases : resolve hierarchy, get/set/delete, encryption gating, decryption failures, list métadonnées)
- **Permissions** : 4 lignes dans `roles-matrix.spec.ts` (toutes `SUPER_ADMIN` exclusif)

## Open questions

- **Tenant scope** : aujourd'hui tout est `GLOBAL`. Quand B6 lande, ajouter `tenant_id` nullable + composite unique `(key, tenant_id)` — ALTER non-breaking. Le SA voit / gère le scope GLOBAL, l'ADMIN d'un tenant gérera le scope TENANT.
- **Rotation de la master key** : pas d'outillage actuel. Stratégie envisagée : commande npm qui prend l'ancienne + la nouvelle, déchiffre / re-chiffre toutes les rows en transaction.
- **Audit des écritures SA** : actuellement la `updatedBy` est tracée mais pas indexée. Pour un compliance log, le `systemConfigs.config.changed` event est déjà persisté par l'audit module (wildcard sur `**`) — à confirmer.
- **Test SMTP / push connectivity** : la page SA pourrait avoir un bouton « Tester » par section. Hors-scope SA.2, à ajouter plus tard.
- **Export/import config** : utile pour cloner un environnement (dev → staging). À considérer en parallèle avec le backup nocturne (C9).

## Refs
- SA.1.a commit — `Role.SUPER_ADMIN` + bootstrap + guard
- SA.1.b commit — schema + AES-GCM + `SystemConfigService`
- SA.2.a commit — `SuperAdminController` + refactor channels
- SA.2.b commit — frontend page + sidebar + Role enum côté front
- [`docs/modules/auth.md`](auth.md) — bootstrap du SA, hiérarchie des rôles
- [`docs/sprints/2026-06-sprint-1-summary.md`](../sprints/2026-06-sprint-1-summary.md) — section "SA — Super-Admin"
