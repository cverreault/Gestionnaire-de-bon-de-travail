# ADR-004: Authentification et autorisation

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | security, auth                 |
| **Depends on** | [ADR-002](ADR-002-tech-stack-selection.md) |

## Context

TaskMgr est utilisé par 3 types d'utilisateurs avec des permissions distinctes (ADMIN, DISPATCHER, TECHNICIAN). L'app est **self-hosted** (chaque client gère ses propres comptes — pas de Single Sign-On externe en v1).

## Decision

### 1. Authentification : JWT

- **Access token** : durée 15 min, contient `{ sub: userId, email, role, iat, exp }`
- **Refresh token** : durée 7 jours, stocké en DB (`user_refresh_tokens`)
- Signature : HS256 avec secret en `.env`
- Aucune SSO/OAuth en v1 (à introduire si demande client)

### 2. Endpoint d'auth

```
POST /api/auth/login          → { accessToken, refreshToken, user }
POST /api/auth/refresh        → { accessToken, refreshToken }
POST /api/auth/logout         → invalide le refresh token
POST /api/auth/me             → { user }  (depuis access token)
```

### 3. Stockage des tokens côté client

- **Access token** : `localStorage` (clé `accessToken`)
- **Refresh token** : `localStorage` (clé `refreshToken`)
- **Intercepteur axios** : ajoute `Authorization: Bearer ${access}`. Sur 401, tente refresh ; si refresh échoue, redirect login.

> ⚠️ `localStorage` est vulnérable à XSS. Mitigation v1 : CSP stricte, pas de `dangerouslySetInnerHTML`. v2 : migrer vers httpOnly cookies.

### 4. Autorisation : rôles

3 rôles globaux dans l'enum `Role` (Prisma) :

| Role | Permissions |
|---|---|
| `ADMIN` | Tout (config, users, BT, clients, adresses, sauvegardes) |
| `DISPATCHER` | BT, clients, adresses, calendar — pas la config ni les users |
| `TECHNICIAN` | Ses propres BT seulement (lecture + transitions autorisées) |

Implémentation : décorateur `@Roles(Role.ADMIN, Role.DISPATCHER)` + `RolesGuard` global.

### 5. Permissions au niveau ressource

**Pour les transitions de processus**, le check de rôle se fait au niveau **transition individuelle** :
- Une transition `Réparti → Terminer positif` a `allowedRoles: ['ADMIN', 'DISPATCHER', 'TECHNICIAN']`
- L'enum `Role` (global) **et** `transition.allowedRoles` (par transition) doivent matcher.

**Pour les sections / champs d'un template** (RBAC granulaire) :
- Chaque `TemplateSection` et `TemplateField` a `viewRoles`, `editRoles`, `requiredRoles`
- Le frontend filtre via `TemplateFormRenderer` selon le rôle courant
- Le backend re-vérifie côté API (pas de confiance dans le frontend)

### 6. Public endpoints

Décorateur `@Public()` pour les endpoints publics (login, health). `JwtAuthGuard` est **global** sinon.

### 7. Hors scope
- Pas de **SSO** (Azure AD, Google, Entra) en v1.
- Pas de **MFA / 2FA** (à introduire avec compte à risque).
- Pas de **permissions personnalisables** par admin — les 3 rôles sont en dur.

---

## Consequences

### Positives
- Simple à implémenter et à comprendre.
- Stateless (JWT) → scale facilement.
- Refresh token rotation possible (à activer en v1.1).

### Négatives / Trade-offs
- **localStorage XSS** → mitigation via CSP, pas via cookie httpOnly pour l'instant.
- **Pas de révocation immédiate** des access tokens (15 min de fenêtre). Mitigation : durée courte + révocation refresh token.
- **3 rôles seulement** → contraint l'évolution. Si besoin de plus, migrer vers ABAC (à ADR-fier).

### Risques
- **Token leak via logs** : ne jamais logger `Authorization` header ou body de `/auth/login`.
- **Refresh token replay** : à mitiger via rotation (générer nouveau refresh à chaque refresh + invalider l'ancien).

---

## Alternatives considered

### Alternative A : Session cookie (express-session)
**Pour** : Pas de XSS sur le token.
**Contre** : Stateful (Redis ou sticky session pour scale).
**Rejetée** : JWT plus simple pour mono-instance v1.

### Alternative B : OAuth via Microsoft Entra External ID
**Pour** : Sécurité enterprise, SSO.
**Contre** : Dépendance cloud, configuration lourde par client.
**Rejetée** : self-hosted = pas de dépendance cloud forcée.

---

## Implementation notes
- Module `auth` : `AuthService`, `JwtStrategy`, `LocalStrategy`, controllers.
- Module `users` : `UsersService` (CRUD), `PreferencesService` (theme, locale, columns).
- Guards globaux dans `app.module.ts` : `JwtAuthGuard` puis `RolesGuard`.
- Secret JWT : `JWT_SECRET` + `JWT_REFRESH_SECRET` dans `.env` (rotation manuelle pour l'instant).

## References
- [JWT Best Practices RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
