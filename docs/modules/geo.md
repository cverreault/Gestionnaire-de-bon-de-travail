# Module: geo

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Implemented |
| **Phase** | 4 (B40) |
| **ADR References** | [ADR-018](../adrs/ADR-018-address-reference-and-geocoding.md), [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-007](../adrs/ADR-007-extension-points-and-contracts.md) |
| **Owner** | Carl Verreault |

## Purpose

Référentiel géographique du produit : autocomplétion d'adresse et géocodage via le géocodeur officiel **Adresses Québec** (MRNF, données ouvertes CC-BY 4.0), repli **Nominatim** (OpenStreetMap) hors Québec ou en cas d'indisponibilité, et **fiche propriété** issue du **rôle d'évaluation foncière géoréférencé** (MAMH, CC-BY 4.0) importé localement.

Le module possède les tables de référence plateforme-wide (`property_units`, `municipalities`, `land_use_codes`) et implémente le contrat `GEOCODER` consommé par `clients` (géocodage automatique à la sauvegarde d'une adresse) et `dispatch-map` (balayage des adresses sans coordonnées). Il ne possède aucune donnée métier.

## Personas servis

| Persona | Usage |
|---|---|
| **Admin / Dispatcher** | Champ « Rechercher une adresse » dans tous les formulaires d'adresse (client, adresse autonome, création de BT) : une suggestion remplit numéro, rue, unité, ville, code postal, province et position GPS |
| **Dispatcher** | Les adresses sont géocodées automatiquement : la carte de répartition n'a plus besoin du bouton « Géocoder » (qui reste disponible) |
| **Technicien** | Fiche propriété sur le détail d'un BT (usage, logements, étages, année, superficies, lot, matricule, valeur au rôle) pour anticiper l'intervention |
| **Admin** | Rafraîchissement annuel du rôle via `backend/scripts/geo/import-role.py` |

## Capabilities

- Suggestions d'adresses pendant la frappe (≥ 3 caractères) en **meilleure correspondance** : `suggest` d'Adresses Québec (exige le générique « rue ») fusionné avec `findAddressCandidates` (tolérant : « 669 principale sainte-marthe » trouve « 669 Rue Principale, Sainte-Marthe ») ; candidats gardés à partir d'un score de 78, dédoublonnés, exacts en premier. Résolution d'une suggestion en champs structurés + GPS (score ≥ 90, sinon `null`)
- Géocodage d'une adresse structurée : Adresses Québec d'abord (score ≥ 90 avec numéro civique égal, **ou** score ≥ 78 si numéro civique et municipalité correspondent tous deux — un « rue » manquant ou une faute légère ne bloque plus), sinon Nominatim en dégradant la requête (numéro + rue → rue → ville). Ne lève jamais d'exception
- Correspondance adresse → unité d'évaluation : avec coordonnées, boîte de ~150 m puis score numéro civique + rue normalisée + distance ; sans coordonnées, municipalité par nom + rue normalisée + numéro ; repli « unité la plus proche » sous 40 m
- Normalisation des odonymes partagée entre le service TypeScript et le script d'import Python (minuscules, sans accents, sans générique ni particule ni orientation finale)

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/geo/suggest?q=` | ADMIN, DISPATCHER | `{ suggestions: [{ text, magicKey }] }` — max 6 |
| `GET` | `/api/geo/resolve?text=&magicKey=` | ADMIN, DISPATCHER | `{ address: { streetNumber, street, apartment, city, postalCode, province: 'QC', country: 'Canada', latitude, longitude, score } \| null }` |
| `GET` | `/api/geo/property?addressId=` (recherche à la demande, la fiche persistée sur l'adresse est la voie normale) ou `?latitude&longitude[&streetNumber&street]` ou `?street&city[&streetNumber]` | ADMIN, DISPATCHER, TECHNICIAN | `{ property: PropertySheet \| null }` |

`PropertySheet` : `matricule, municipality, address, landUseCode, landUseLabel, dwellings, storeys, yearBuilt, landAreaM2, floorAreaM2, lotNumbers[], valueLand, valueBuilding, valueTotal, rollYear, latitude, longitude, matchedBy ('number+street' | 'nearest'), distanceMeters`.

`addressId` passe par `client_addresses` sous le middleware tenant-scope : une adresse d'un autre tenant renvoie `null`.

## Fiche propriété sur l'adresse (B40.2)

Les attributs de la propriété sont **copiés sur `client_addresses`** au moment du géocodage (colonnes `property_*`, plus `geocoded_at` / `geocode_source`) : l'adresse est autoporteuse, aucun appel supplémentaire pour afficher la fiche sur un BT ou une fiche client, et les colonnes sont exportables/filtrables.

- `clients` : après création ou modification d'une adresse (`ClientsService.enrichGeo`, fire-and-forget) — géocode si les coordonnées manquent, puis `findProperty` du contrat et écriture via `propertyFactsToAddressColumns()`. Une modification des parties postales remet tout à zéro (`ADDRESS_GEO_RESET`) et relance.
- `POST /api/clients/addresses/:id/geo-refresh` (ADMIN, DISPATCHER) : re-géocode et rafraîchit la fiche de façon synchrone (bouton « Actualiser » de la fiche).
- `dispatch-map` : le balayage (bouton + cron 10 min) géocode les adresses sans coordonnées **et** apparie celles géocodées mais jamais rapprochées du rôle (`property_matched_at IS NULL`, 200 par passe, requêtes locales seulement) — c'est ainsi que les adresses antérieures à l'import et celles d'un rôle rafraîchi sont rattrapées.
- `property_matched_at` est posé même sans correspondance (`property_matched_by` null) pour ne pas réessayer à chaque passe.

## Domain events publiés

| Event | Quand | Payload |
|---|---|---|
| `geo.roll.imported` | Fin réussie d'un import de rôle (portail super-admin) | `{ rollYear, rowsImported, actorUserId, aggregateId: jobId }` |

Consommé par `clients` (`GeoRollListener` : ré-appariement de toutes les adresses) et enregistré par `audit` s'il écoute `geo.**` (non branché en v1).

## Domain events consommés

Aucun. Le module est appelé par contrat (`GEOCODER`) ou par HTTP.

## Données possédées

Tables **plateforme-wide** (pas de `tenant_id`, absentes de `TENANT_SCOPED_MODELS`), chargées par `backend/scripts/geo/import-role.py` et **jamais écrites par l'application** :

- `property_units` (Prisma `PropertyUnit`) — une ligne par adresse d'unité d'évaluation (~3,8 M) : `id_provinc + address_seq` PK, `code_mun`, `matricule`, `civic_number/_suffix/_end`, `street_generic`, `street_link`, `street_name`, `street_norm`, `orientation`, `unit_number`, `latitude`, `longitude`, `land_use_code`, `year_built`, `storeys`, `dwellings`, `land_area_m2`, `floor_area_m2`, `value_land/building/total` (DOUBLE PRECISION : certains immeubles dépassent 2^31 $), `lot_numbers`, `roll_year`. Index `(latitude, longitude)` et `(code_mun, street_norm, civic_number)`
- `municipalities` (`Municipality`) — code géographique → nom, ~1 130 lignes
- `land_use_codes` (`LandUseCode`) — CUBF 4 chiffres → libellé, ~1 750 lignes
- `geo_import_jobs` (`GeoImportJob`) — journal des imports lancés depuis le portail (statut, dates, lignes, log, erreur)

Lecture directe de `client_addresses` (par `addressId`) : même exception documentée que `dashboard` / `search`.

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `clients` | consommateur du contrat `GEOCODER` | `ClientsService.scheduleGeocode()` après création / modification d'adresse (fire-and-forget) |
| `dispatch-map` | consommateur du contrat `GEOCODER` | `GeocodingService` : bouton carte + cron `*/10 * * * *` sur les adresses sans coordonnées |
| Adresses Québec (MRNF) | externe | `https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/Adresse_Geocodage/GeocodeServer` — suggest, findAddressCandidates ; délai 6 s |
| Nominatim (OSM) | externe | repli, ≤ 1 req/s, User-Agent identifiant |

Contrat : `backend/src/common/contracts/geocoder.contract.ts` (`GEOCODER`, `IGeocoder`, `GeocodeInput`, `GeocodeResult`). `GeoModule` est `@Global()` et lie le token, comme `SystemConfigsModule`.

## Mise à jour du rôle depuis le portail super-admin (B40.3)

Page `/super-admin/geo` (« Référentiel d'adresses ») : état du rôle chargé (année, lignes, municipalités, dernier import), bouton « Vérifier les mises à jour » (HEAD sur `https://donneesouvertes.affmunqc.net/role/ROLE<année>_GEOPACKAGE.zip` de l'année chargée à l'année prochaine), bouton « Importer le rôle <année> », journal en direct et historique.

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/super-admin/geo/status` | SUPER_ADMIN | Année chargée, comptes, dernier job, job en cours |
| `GET` | `/api/super-admin/geo/available` | SUPER_ADMIN | Années publiées par le MAMH |
| `GET` | `/api/super-admin/geo/jobs`, `/jobs/:id` | SUPER_ADMIN | Historique et journal |
| `POST` | `/api/super-admin/geo/import` `{ year }` | SUPER_ADMIN | 202 — lance le job en arrière-plan ; 409 si un import tourne déjà |

`RollUpdateService` télécharge le zip et l'index dans `GEO_IMPORT_WORKDIR` (défaut `/tmp`), décompresse, exécute `scripts/geo/import-role.py` (copié dans l'image ; `python3` et `psql` y sont présents) avec `DATABASE_URL`, journalise la sortie (`geo_import_jobs.log`, 16 ko), puis émet **`geo.roll.imported`** (`common/contracts/geo-events.contract.ts`). `clients` l'écoute (`GeoRollListener`) et remet `property_matched_at` à NULL sur toutes les adresses : le balayage de `dispatch-map` les ré-apparie au nouveau rôle. Le répertoire de travail est supprimé à la fin. Adresses Québec est un service en ligne : aucune mise à jour à gérer.

## Import manuel en ligne de commande

```bash
# 1. Télécharger (≈ 570 Mo zip → 2,8 Go GeoPackage) + index des municipalités
curl -o /tmp/role/ROLE2026_GEOPACKAGE.zip https://donneesouvertes.affmunqc.net/role/ROLE2026_GEOPACKAGE.zip
curl -o /tmp/role/indexRole2026.csv       https://donneesouvertes.affmunqc.net/role/indexRole2026.csv
unzip -q /tmp/role/ROLE2026_GEOPACKAGE.zip -d /tmp/role

# 2. Importer (≈ 10 min ; TRUNCATE + COPY par table dans une transaction : l'ancien contenu reste en cas d'échec)
python3 backend/scripts/geo/import-role.py \
  --gpkg /tmp/role/Role2026_geopackage/Role_2026_2.gpkg \
  --index /tmp/role/indexRole2026.csv --year 2026 \
  --dsn taskmgr --psql "docker exec -i taskmgr_postgres psql -U taskmgr"
```

Le MAMH publie un nouveau rôle chaque année (printemps) : relancer l'import avec `--year`. Les adresses sans point, en doublon ou dont l'odonyme est un simple « - » sont ignorées.

## Tests

- **Unit** : `application/address-normalize.spec.ts` (normalisation, code postal, numéro civique, distance), `application/address-lookup.service.spec.ts` (suggest, résolution, seuil de score, repli Nominatim, hors Québec), `application/property.service.spec.ts` (score numéro + rue, plages, plus proche sous 40 m, sans coordonnées, isolation par tenant)
- **Permissions** : `common/guards/roles-matrix.spec.ts` — 3 lignes `GeoController`
- **Arch** : `npm run arch:check` — aucune nouvelle exception (contrat dans `common/contracts`)
- **Import** : validé sur une base de travail avec `--limit 30000`

## Routage — Valhalla (B47, ADR-019)

Service compose `valhalla` (réseau interne, `VALHALLA_URL`), tuiles construites depuis l'extrait OSM Québec dans le volume `taskmgr_valhalla_data`. Contrat `ROUTER` (`common/contracts/router.contract.ts`) implémenté par `infrastructure/valhalla.client.ts` : `route(points)` (km, minutes, tracé décodé du polyline 1e-6, manœuvres), `matrix(sources, targets)` (minutes / km, `null` si inatteignable), `status()`. Routes : `POST /geo/route` (tout le personnel ; l'app affiche « 12 km · 18 min de route » avant « Y aller »), `GET /geo/router/status` (admin, répartiteur). Toute panne ou construction en cours renvoie `null` : `dispatch-map` retombe sur l'heuristique à vol d'oiseau (`engine: 'haversine'`).

**Limites de service (B53).** La configuration de Valhalla (`/custom_files/valhalla.json`, générée au premier démarrage dans le volume) plafonne par défaut une matrice à 400 km par paire et un itinéraire à 20 points. `scripts/geo/valhalla-limits.sh` relève `auto.max_matrix_distance` à 1 500 km et `auto.max_locations` à 60, puis redémarre le conteneur ; à relancer après un rafraîchissement des cartes (volume recréé). Une paire refusée ou un point hors carte fait répondre `null` : `dispatch-map` renvoie alors `engine: 'haversine'` avec `reason: 'router_refused'` (moteur joignable) ou `'router_unavailable'` (panne, tuiles absentes). Une position de technicien à plus de 300 km de tous ses arrêts (fix périmé, émulateur Android par défaut en Californie) est ignorée : la tournée part de l'arrêt le plus proche et la réponse porte `startIgnored: true` + `startDistanceKm`.

## Position des techniciens (B57)

Chaque requête authentifiée de l'app porte `X-Client-Location` ; `JwtAuthGuard` émet `locations.clientFix.reported` (≤ 1/min/utilisateur) et `LocationsService.onClientFix` l'enregistre comme position (consentement GPS re-vérifié, silencieux sinon). `GET /dispatcher/technicians/:id/position` renvoie la dernière position, son âge et l'adresse la plus proche via `IGeocoder.reverse` (Nominatim) ; `POST /dispatcher/technicians/:id/locate` envoie un push `{ type: 'locate' }` auquel l'app répond par un envoi de position immédiat.

## Open questions

- Adresses Québec n'a pas de limite publiée : surveiller les 429 dans les logs ; un cache court des suggestions côté backend serait la première mesure.
- Le rôle a une adresse par **propriété**, pas par logement : un condo apparaît par unité (`unit_number`) ; la fiche privilégie la ligne sans unité (le bâtiment).
- Les accents des odonymes sont absents pour la plupart des municipalités : l'affichage passe par `titleCase()` ; l'autocomplétion (Adresses Québec) reste la source des libellés corrects.

## Refs
- [ADR-018](../adrs/ADR-018-address-reference-and-geocoding.md)
- Données Québec — [Adresses Québec](https://www.donneesquebec.ca/recherche/dataset/adresses-quebec), [Rôle d'évaluation foncière du Québec](https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec)
- [dispatch-map](../adrs/ADR-008-gps-tracking-privacy.md) pour la carte des positions (distinct des adresses)
