# TaskMgr Public API v1 — Guide de démarrage

L'API publique v1 permet à un système externe (CRM, formulaire client,
orchestrateur, BI…) de piloter TaskMgr comme un opérateur : créer,
modifier, transitionner des BTs, gérer clients et adresses, uploader des
pièces jointes, lire le catalogue des types et processus.

Elle est différente de l'API interne utilisée par le frontend :

| | API interne | **API publique v1** |
|---|---|---|
| Chemin | `/api/*` | `/api/v1/*` |
| Auth | JWT (`Authorization: Bearer …`) | **Clé API (`X-API-Key: tkm_…`)** |
| Tenant | Résolu depuis le sous-domaine | Porté par la clé |
| Public | Non | Oui |
| Rate limit | 20 req/s par user | 30 req/s par clé (configurable) |

---

## 1. Créer une clé API

1. Connecte-toi au portail TaskMgr en tant que **ADMIN** du tenant.
2. Menu latéral → **🔑 Clés API** (`/parametres/api-keys`).
3. Bouton **« ➕ Créer une clé API »** :
   - **Nom** — libellé libre (`Zapier`, `CRM interne`, …).
   - **Permissions** — un des trois bundles :
     - `read-only` — un dashboard BI qui lit sans écrire.
     - `read-write` — la majorité des intégrations M2M (recommandé).
     - `admin` — inclut la modification des paramètres tenant. À réserver.
   - **Expiration** — optionnelle. Vide = ne s'expire jamais.
4. Le plaintext (`tkm_dev_...` ou `tkm_live_...`) est affiché **une seule
   fois**. Copie-le immédiatement dans le coffre de ton système.
5. Perdu ? Révoque la clé et crée-en une nouvelle. Le hash SHA-256 stocké
   en DB ne permet pas de récupérer le plaintext.

---

## 2. Authentifier une requête

Ajoute le header **`X-API-Key`** :

```bash
curl -H "X-API-Key: tkm_live_ABCdef1234..." \
  https://votre-domaine.taskmgr.com/api/v1/technicians
```

Réponses possibles :

| Code | Cause |
|---|---|
| `200` | OK |
| `201` | Créé (POST) |
| `401 Unauthorized` | Header manquant, clé invalide, révoquée ou expirée |
| `403 Forbidden` | Scope insuffisant pour l'endpoint appelé |
| `429 Too Many Requests` | Rate limit dépassé — voir les headers `X-RateLimit-*` et `Retry-After` |
| `400 Bad Request` | Validation DTO échouée — le corps contient un tableau `message` avec les champs fautifs |

---

## 3. Modèle de permissions (scopes)

Hiérarchie : `admin ⊇ read-write ⊇ read-only`.

| Scope de la clé | Peut appeler des endpoints marqués… |
|---|---|
| `read-only` | `read-only` |
| `read-write` | `read-only`, `read-write` |
| `admin` | tout |

Chaque endpoint documente son scope dans Swagger (`/api/v1/docs`).
Résumé :

| Ressource | Verbes | Scope min |
|---|---|---|
| `GET /api/v1/work-orders` | Lecture | `read-only` |
| `POST /api/v1/work-orders` | Création | `read-write` |
| `PATCH /api/v1/work-orders/:id` | Modification (⚠️ `status` interdit) | `read-write` |
| `POST /api/v1/work-orders/:id/transition` | Changer de statut | `read-write` |
| `POST /api/v1/work-orders/:id/notes` | Ajouter une note | `read-write` |
| `GET /api/v1/clients`, `POST`, `PATCH`, `DELETE` | Clients (+ adresses) | `read-only` / `read-write` |
| `POST /api/v1/work-orders/:id/attachments` | Upload multipart | `read-write` |
| `GET /api/v1/task-types`, `client-types`, `address-types`, `technicians` | Catalogue | `read-only` |
| `GET /api/v1/processes/:id/snapshot` | Graph d'états | `read-only` |

---

## 4. Exemples end-to-end (curl)

### 4.1 — Lister les techniciens actifs

```bash
curl -H "X-API-Key: $API_KEY" \
  https://votre-domaine.taskmgr.com/api/v1/technicians
```

Retour :
```json
{
  "success": true,
  "data": [
    { "id": "…", "firstName": "Jean", "lastName": "Tremblay", "phone": "…", "email": "…" }
  ],
  "timestamp": "2026-07-02T13:00:00.000Z"
}
```

### 4.2 — Créer un bon de travail

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fuite chauffe-eau",
    "type": "REPAIR",
    "description": "Fuite au réservoir signalée par le client",
    "priority": 3,
    "taskTypeId": "…",
    "clientId": "…",
    "clientAddressId": "…",
    "assignedToId": "…",
    "scheduledStartTime": "2026-07-05T13:00:00Z",
    "scheduledEndTime":   "2026-07-05T15:00:00Z"
  }' \
  https://votre-domaine.taskmgr.com/api/v1/work-orders
```

Retourne le BT complet (`201 Created`) avec `id`, `referenceNumber`
(`REP-20260705-0001`), `status: "CREATED"`, `currentStepId`.

### 4.3 — Transitionner le statut

Le champ `status` du PATCH est **interdit** dans l'API publique — les
transitions passent par un endpoint dédié qui valide via le moteur de
processus (transitions autorisées, champs requis).

```bash
# 1. Récupérer les transitions possibles
curl -H "X-API-Key: $API_KEY" \
  https://votre-domaine.taskmgr.com/api/v1/work-orders/$WO_ID/available-transitions

# 2. Appliquer la transition
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "targetStepId": "…", "completionNotes": "Fuite colmatée, test étanchéité OK" }' \
  https://votre-domaine.taskmgr.com/api/v1/work-orders/$WO_ID/transition
```

### 4.4 — Ajouter une note

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Client rappelé — RDV confirmé pour vendredi 10h." }' \
  https://votre-domaine.taskmgr.com/api/v1/work-orders/$WO_ID/notes
```

### 4.5 — Uploader une pièce jointe (multipart)

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -F "file=@rapport-intervention.pdf" \
  https://votre-domaine.taskmgr.com/api/v1/work-orders/$WO_ID/attachments
```

Formats acceptés : jpg/png/gif/webp/pdf/doc/docx/xls/xlsx. Taille max : 10 Mo.
La réponse inclut une URL de téléchargement présignée (TTL 1h).

### 4.6 — Créer un client + adresse

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Marie",
    "lastName": "Dubois",
    "clientType": "RESIDENTIAL",
    "email": "marie.dubois@example.com",
    "phone": "+15145550101",
    "addresses": [
      {
        "streetNumber": "123",
        "street": "rue Principale",
        "city": "Montréal",
        "postalCode": "H2X 1Y5",
        "isDefault": true
      }
    ]
  }' \
  https://votre-domaine.taskmgr.com/api/v1/clients
```

---

## 5. Rate limiting

Trois buckets nommés fonctionnent en parallèle. Les headers de chaque
réponse indiquent l'état de chaque bucket :

```
X-RateLimit-Limit-short: 30       X-RateLimit-Remaining-short: 29     X-RateLimit-Reset-short: 1
X-RateLimit-Limit-medium: 300     X-RateLimit-Remaining-medium: 299   X-RateLimit-Reset-medium: 10
X-RateLimit-Limit-long: 3000      X-RateLimit-Remaining-long: 2999    X-RateLimit-Reset-long: 60
```

Défauts (par clé) : **30 req/s, 300 req/10s, 3000 req/min**. Un `429`
inclut un `Retry-After` en secondes — attends la valeur indiquée avant
de retenter. Les buckets sont isolés par clé, donc une intégration qui
sature ne pénalise pas les autres.

Configuration par déploiement (fichier `.env`) :
```env
PUBLIC_API_THROTTLE_SHORT=30
PUBLIC_API_THROTTLE_MEDIUM=300
PUBLIC_API_THROTTLE_LONG=3000
```

---

## 6. Format des réponses

Chaque réponse `2xx` est enveloppée :

```json
{
  "success": true,
  "data": { … },
  "timestamp": "2026-07-02T13:00:00.000Z"
}
```

Les erreurs suivent la structure standard NestJS avec les détails de
validation (via `nestjs-i18n`) :

```json
{
  "statusCode": 400,
  "timestamp": "…",
  "path": "/api/v1/work-orders",
  "method": "POST",
  "message": [
    { "property": "title", "constraints": { "isNotEmpty": "title should not be empty" } }
  ]
}
```

Le header `Accept-Language: en` (ou `?lang=en`) bascule les messages
d'erreur en anglais.

---

## 7. Sécurité

- Le hash SHA-256 seul est stocké en DB — la clé plaintext n'est **jamais**
  récupérable après création. En cas de perte : révoquer + recréer.
- La révocation prend effet **immédiatement** — la prochaine requête reçoit
  un `401`.
- Le tenant est déterminé par la clé, pas par le sous-domaine ni un header.
  Il n'y a **aucun moyen** pour une clé du tenant A d'accéder aux données
  du tenant B.
- Les scopes sont vérifiés à chaque requête. Une clé `read-only` ne peut
  **pas** créer/modifier/supprimer, même via un endpoint mal annoté (le
  guard defensivement défaut à `admin` sur les endpoints qui oublient
  `@Scope()`).
- Toutes les créations/révocations/appels sont émis comme événements
  `apiIntegration.*` et persistés dans `audit_logs` (accessibles au SA
  cross-tenant via `/super-admin/audit`).

---

## 8. Documentation interactive

Le spec OpenAPI 3.0 complet + l'interface Swagger UI sont accessibles
sans authentification :

| URL | Contenu |
|---|---|
| `https://votre-domaine.taskmgr.com/api/v1/docs` | Swagger UI interactif (Try-It-Out inclus) |
| `https://votre-domaine.taskmgr.com/api/v1/docs-json` | Spec OpenAPI 3.0 JSON (pour import Postman, génération SDK, etc.) |

Le bouton **« Authorize »** dans Swagger UI accepte ta clé API — les
requêtes émises depuis la page seront authentifiées.

---

## 9. Ce qui **n'est pas** exposé en v1

- **Users** — création/modification (`POST /users`, `PATCH /users/:id`) —
  risque d'escalade de privilège via le champ `role`. Seul
  `GET /technicians` est disponible.
- **Templates de BT** — CRUD réservé à l'admin interne (config système).
- **Processus** — CRUD réservé (state machine sensible). Seul
  `GET /processes/:id/snapshot` est disponible en lecture.
- **CSV export/import** — pas d'endpoint bulk pour l'instant.
- **Configuration plateforme / tenant** — passe par l'UI.
- **Webhooks (événements sortants)** — reportés à v2. Pour l'instant,
  polle les endpoints de lecture.

---

## 10. Follow-ups v2 envisagés

Voir [ADR-011](../adrs/ADR-011-public-api-authentication.md) § Follow-ups :

- Webhooks avec signature HMAC + retry outbox.
- Scopes fine-grained (`workOrders:read`, `clients:write`, …).
- Rate limit override configurable par clé.
- Allowlist IP par clé.
- SDK JavaScript/Python/PHP auto-générés depuis le spec OpenAPI.
