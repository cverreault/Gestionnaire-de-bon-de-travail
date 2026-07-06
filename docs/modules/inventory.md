# Module `parts` — Inventaire & pièces (B24)

## Rôle

| Capacité | Détail |
|---|---|
| Catalogue | Pièces bilingues (SKU unique par tenant, coûtant + prix de vente CAD, unité, seuil d'alerte), soft-delete gardé par « utilisée sur un BT actif » |
| Stock | **Entrepôt** (`Part.quantityOnHand`) + **camions** (`TechnicianPartStock`, unique `[partId, technicianId]`) — réception, ajustement signé (note obligatoire), transfert entrepôt ↔ camion |
| Journal | `StockMovement` append-only : `RECEIPT / ADJUSTMENT / TRANSFER_TO_TECH / TRANSFER_TO_WAREHOUSE / USAGE / USAGE_REVERT` — chaque changement de quantité écrit sa ligne **dans la même transaction** ; résultat négatif → 409 avec la quantité disponible |
| Pièces sur BT | `WorkOrderPart` : source camion (technicien) ou entrepôt (bureau), **prix figés à l'insertion** (`unitCostPrice`/`unitSalePrice` — traçabilité interne des coûts au moment de l'usage ; aucun module de facturation dans ce produit), retrait symétrique (`USAGE_REVERT`), verrouillé quand le BT est terminal ; rendues dans le PDF (noms + quantités, sans prix) |

## Surface API

| Méthode | Route | Rôles |
|---|---|---|
| CRUD | `/parts` (+ `/:id/movements`, `/stock-by-technician`) | ADMIN, DISPATCHER |
| `GET` | `/parts/catalog` (liste allégée pour le sélecteur BT) | ADMIN, DISPATCHER, TECHNICIAN |
| `POST` | `/parts/:id/receive`, `/:id/adjust`, `/:id/transfer` | ADMIN, DISPATCHER |
| `GET/POST/DELETE` | `/work-orders/:id/parts[/:rowId]` — garde IDOR technicien (ses BT), auteur-ou-staff au retrait | ADMIN, DISPATCHER, TECHNICIAN |
| `GET` | `/me/parts-stock` (son camion) | TECHNICIAN |

Contrat verrouillé par `roles-matrix.spec.ts` (rangées PartsControllers). Logique de stock testée dans `stock.service.spec.ts` (10 cas : gardes négatives, transferts, usage/revert, franchissement de seuil).

## Domain events

### `inventory.stock.low` (émis par `StockService`)

| Champ | Type |
|---|---|
| `partId`, `sku`, `name`, `tenantId` | string |
| `quantity` | number — quantité entrepôt après le mouvement |
| `minStock` | number — seuil configuré |

Émis **uniquement au franchissement** du seuil entrepôt (`avant >= minStock && après < minStock`, seuil 0 = jamais) — un mouvement supplémentaire sous le seuil ne ré-émet pas. Consommé par `notifications.listener` → in-app + courriel à tous les ADMIN/DISPATCHER (préférence `inventory.lowStock`, défaut inApp+email, lien `/inventaire`).

## Résolution de la source d'une pièce sur BT

- Appelant TECHNICIEN → son camion (`TECHNICIAN_STOCK`, `technicianId = appelant`)
- Appelant bureau → entrepôt (`WAREHOUSE`) ; s'il choisit explicitement `TECHNICIAN_STOCK` → camion du technicien assigné au BT (409 si aucun)
- `WorkOrderPart.technicianId` mémorise le camion d'origine pour créditer le bon stock au retrait

## Frontend

- `/inventaire` (AdminRoute) : table catalogue avec badge 🔻 stock bas, modales réception/ajustement/transfert, historique des mouvements, vue « stock par camion »
- Section « 🔩 Pièces utilisées » sur `WorkOrderDetailPage` et `TechnicianWorkOrderDetailPage` (composant partagé `WorkOrderPartsSection`)
- `/mon-stock` + entrée 📦 dans la nav mobile technicien
- Namespace i18n `inventory` (fr/en)
