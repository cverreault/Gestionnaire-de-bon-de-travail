# Module: search

| Field | Value |
|---|---|
| **Type** | Optional (quick-win UX) |
| **Status** | Implemented |
| **Phase** | 1 (A2) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md) |
| **Owner** | Carl Verreault |

## Purpose

Top-bar de recherche globale pour les admins et dispatchers — frappe le moindre fragment (numéro de référence, nom de client, rue) et obtient une liste unifiée pointant vers la bonne ressource. Évite la perte de 30s par recherche en jonglant entre les pages BT / clients / adresses.

## Personas servis

| Persona | Usage |
|---|---|
| **Admin** | Top-bar (Ctrl/⌘ + K) → recherche par référence BT, nom client, rue |
| **Dispatcher** | Idem |
| **Technicien** | Pas exposé (le tech voit seulement ses propres BT, pas besoin d'une vue d'ensemble) |

## Capabilities

- Recherche en **parallèle** sur 3 modèles : `work_orders`, `clients`, `client_addresses`
- Format unifié `SearchHit { type, id, title, subtitle, url }` peu importe la source
- Cap **10 hits par type** (30 max au total) — évite de surcharger le dropdown
- Insensible à la casse, match `contains` côté Prisma
- Désactivé côté hook si la query a `< 2` caractères (`enabled: trimmed.length >= 2`)
- Debounce 250ms côté frontend pour ne pas spammer le backend à chaque keystroke
- Raccourci clavier `Ctrl/⌘+K`, navigation ↑↓ Enter Escape

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/search?q={query}` | ADMIN, DISPATCHER | Retourne `{ query, total, hits[] }` |

Backend trim et lowercase la `q` avant `where : OR : [...]`. Limit 10 par catégorie hardcodé (constante `LIMIT_PER_TYPE`).

## Domain events publiés

Aucun. Service de pure lecture.

## Domain events consommés

Aucun.

## Données possédées

Aucune table propre. Le module lit les modèles d'autres modules :

- `work_orders` (référence, titre, externalClientName)
- `clients` (firstName, lastName, companyName, email, phone)
- `client_addresses` (street, streetNumber, city, postalCode, label)

**Pas d'import direct** des services métier — les lectures se font via `PrismaService` avec des projections strictes (`select` minimal), ce qui maintient le module en lecture sans contourner les protections d'autres services.

> Note ADR-001 : c'est une exception explicite à la règle « pas de jointure cross-module ». Justifiée par le besoin de performance (parallel queries) et le caractère read-only. Si le module évolue vers de l'écriture, refactorer en délégation.

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `work-orders` | soft (lecture Prisma) | Source des hits type=workOrder |
| `clients` | soft (lecture Prisma) | Source des hits type=client + adresses |

## Tests

Aucun test unitaire dédié à l'heure actuelle (le service est minimal — 3 queries + un mapping). Couverture indirecte via :

- `common/guards/roles-matrix.spec.ts` — vérifie que le contrôleur est bien gardé en ADMIN + DISPATCHER (déjà inclus en filigrane via le pattern matrix, à confirmer si le contrôleur est ajouté à la matrice).

À ajouter en Sprint 2 : spec qui assert que le service retourne au max `LIMIT_PER_TYPE` hits par catégorie et concatène dans l'ordre work-orders → clients → addresses.

## Open questions

- Faut-il indexer en plein texte (Postgres `tsvector` + GIN) plutôt que `contains` ? Avec ~5000 BT actifs le `ILIKE` reste raisonnable, mais au-delà de 50k l'index full-text deviendra nécessaire.
- Élargir aux notes ? Le `wo.notes[].content` n'est pas indexé, mais souvent c'est là que les dispatchers cherchent un détail terrain.
- Cacher côté backend (Redis) si le pattern d'usage devient massif ? Pour l'instant le `staleTime: 30s` de React Query suffit.

## Refs
- A2 commit (livré avant le sprint courant) — câblage initial
- `frontend/src/components/GlobalSearchBar.tsx` — composant top-bar
- `frontend/src/hooks/useGlobalSearch.ts` — hook React Query avec debounce
