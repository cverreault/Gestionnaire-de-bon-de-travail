# ADR-002: Sélection de la stack technologique

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | stack, infrastructure          |
| **Depends on** | — |

## Context

TaskMgr doit être :
- **Self-hosted** chez les clients (PME, OBNL, services municipaux)
- **Maintenable par un seul dev** avec assistance IA (Claude)
- **Déployable rapidement** sur un VPS Linux modeste (4 vCPU / 8 GB RAM)
- **Compatible mobile/tablette** pour les techniciens (PWA)
- **Bilingue FR/EN** dès l'amorçage

## Decision

### Backend : NestJS 10 + TypeScript + Prisma + PostgreSQL 16

| Pourquoi | Justification |
|---|---|
| **NestJS** | Framework opinioné, structure modulaire native, écosystème mature, doc française disponible |
| **TypeScript** | Sécurité de typage + tooling moderne ; cohérence avec le frontend |
| **Prisma** | Migrations versionnées, type-safety bout-en-bout, schema unique source de vérité |
| **PostgreSQL 16** | JSONB pour les champs flexibles (templateData, typeData, preferences), full-text search, RLS si multi-tenant futur |

### Frontend : React 18 + Vite + Zustand + React Query + react-i18next

| Pourquoi | Justification |
|---|---|
| **React 18** | Écosystème + maintenabilité long terme |
| **Vite** | Build rapide, HMR, pas de webpack à configurer |
| **Zustand** | Store minimaliste pour l'auth et les préférences UI |
| **React Query** | Cache et invalidations server-state — évite Redux pour les données distantes |
| **react-i18next** | Standard industrie, namespaces, fallback gracieux |
| **Inline styles via `theme.ts`** | Pas de CSS-in-JS lourd, CSS variables pour les thèmes dark/light |

### Stockage fichiers : MinIO (S3-compatible)
Self-hosted, compatible avec AWS S3 si jamais migration cloud. Bucket unique `taskmgr-attachments`.

### Reverse proxy : Nginx
Sert le frontend buildé, proxy `/api/*` vers backend, TLS termination (Let's Encrypt en prod via Nginx Proxy Manager).

### i18n : `nestjs-i18n` (backend) + `react-i18next` (frontend)
Voir [ADR-005-i18n-bilingual-app.md](ADR-005-i18n-bilingual-app.md).

### Auth : JWT (access 15 min + refresh 7 jours)
Rôles ADMIN / DISPATCHER / TECHNICIAN. Pas de RBAC granulaire pour l'instant (à monter en ADR si besoin).

### Déploiement : Docker Compose
Stack unique avec services `backend`, `frontend`, `postgres`, `minio`, `nginx`. Pas d'orchestration K8s.

### Hors scope
- Pas de **Redis / BullMQ** pour l'instant (à introduire si besoin d'async — notifications push, batch reports).
- Pas de **GraphQL** — REST suffit, plus simple à observer.
- Pas de **micro-frontend** — un seul SPA React.

---

## Consequences

### Positives
- **Type-safety bout-en-bout** : Prisma → DTO → React (mêmes types).
- **Migration DB versionnée** via Prisma migrations.
- **Hot reload** dev rapide (Vite + NestJS watch).
- **Pas de vendor lock-in cloud** — tout est open-source ou self-hosted.

### Négatives / Trade-offs
- **NestJS** est verbeux (décorateurs, modules) — accepté en échange de la structure.
- **Prisma** ne supporte pas tous les patterns SQL (ex: window functions complexes) — fallback raw SQL via `$queryRaw`.
- **MinIO** ajoute un service à monitorer (mais simple à opérer).

### Risques
- **Vite 5** vs Webpack : Vite est rapide en dev mais le build production peut être moins optimisé que Webpack pour des bundles >1 Mo. Mitigation : code-splitting agressif si on dépasse 1 Mo.
- **TypeScript strict mode** : pas encore activé partout. À durcir en v1.1.

---

## Alternatives considered

### Backend
- **Express + Sequelize** : trop bas niveau, plus de boilerplate.
- **Fastify + Mikro-ORM** : performant mais moins de docs FR.
- **AdonisJS** : DX très bon mais écosystème plus petit.

### Frontend
- **Next.js 14** : envisagé, mais SSR pas nécessaire pour un outil interne (pas de SEO). Vite suffit.
- **Vue / Nuxt** : équivalent technique, choix React pour l'écosystème plus large.

### Base de données
- **MySQL 8** : possible mais Postgres a un meilleur support JSONB et RLS.
- **MongoDB** : rejeté — les BT ont des relations claires, le relationnel s'impose.

---

## Implementation notes
- `package.json` `engines.node` doit être à `>=20.0.0`.
- `tsconfig.json` côté backend a `strict: true` mais quelques flags peuvent être relâchés (à durcir).
- Variables d'env validées via `@nestjs/config` + Joi (à étoffer).

## References
- [NestJS docs](https://docs.nestjs.com/)
- [Prisma docs](https://www.prisma.io/docs)
- Inspiration : IMP (NestJS + Next.js + Postgres + i18n) ; VigilOS pour la rigueur architecturale.
