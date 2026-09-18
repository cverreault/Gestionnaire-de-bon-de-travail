# ADR-018 — Address reference: Adresses Québec geocoder + imported assessment roll

- **Status**: Accepted
- **Date**: 2026-09-18
- **Deciders**: cverreault
- **Supersedes**: —

## Context

Addresses were geocoded only when a dispatcher clicked « Géocoder » on the
map, through Nominatim (OpenStreetMap). Nothing ran on address creation, so
new addresses sat without coordinates and the map went blind. Typing an
address was also free-form: typos in street names and missing postal codes
were common, and nothing told the technician what kind of building they
were driving to.

The user asked for « all the assessment rolls with GPS positions, imported
in our system, with autocomplete that fills the right fields ». Two open
datasets exist:

- **Adresses Québec** (MRNF, CC-BY 4.0): every civic address in Québec with
  coordinates, exposed as a free Esri GeocodeServer with `suggest` and
  `findAddressCandidates` (returns civic number, odonym with accents, unit,
  city, postal code, lat/lng, score).
- **Rôle d'évaluation foncière géoréférencé** (MAMH, CC-BY 4.0): 3.75 M
  assessment units with a point each, plus the unit's attributes (land use,
  year built, storeys, dwellings, areas, lots, assessed values). No postal
  code, odonyms in uppercase mostly without accents, one row per property
  rather than per dwelling.

## Decisions

### 1. Adresses Québec is the source for typing and geocoding; the roll is the source for the property sheet

The two datasets describe different things. The geocoder describes the
**address** and is the only one able to fill a form correctly (postal code,
casing, accents, unit). The roll describes the **property** behind it and
is the only one that knows it is a 1965 two-storey triplex on lot 1234567.
We use each for what it is good at instead of forcing one to do both.

**Rejected** because:
- *Roll only* — no postal code (a required field), uppercase odonyms,
  yearly refresh; we would rebuild a worse geocoder than the free official
  one.
- *Geocoder only* — no property facts; the technician value is lost.
- *Google / Mapbox geocoding* — paid, licence restrictions on storing
  results, and no better coverage of Québec than the provincial dataset.

### 2. The roll is imported locally, reduced to what the sheet needs

`backend/scripts/geo/import-role.py` (Python stdlib + `psql COPY`) loads
`property_units`, `municipalities` and `land_use_codes` from the
GeoPackage; ~3.8 M rows, ~1.5 GB with indexes. Tables are platform-wide
(no `tenant_id`), read-only for the application, refreshed once a year
by re-running the script. Each table is truncated and reloaded inside one
transaction so a failed import keeps the previous data.

**Rejected**: querying the roll files at runtime (2.8 GB SQLite on the
API host, no spatial index) and PostGIS (the `postgres:16-alpine` image
has none; a lat/lng B-tree box query is enough at ~150 m).

### 3. Matching address → unit is done by coordinates, then civic number + normalised street

With the coordinates Adresses Québec gives us, we search a ~150 m box and
score: civic number equal (or within a civic range) +100, normalised
street equal +50 / token overlap +20, minus distance/10, +1 for the
building row over an apartment row. Without coordinates we fall back to
municipality name + normalised street + number. A « nearest unit » match
is accepted only within 40 m and is flagged as such in the UI.

Street normalisation (lowercase, no accents, no generic « rue », no
particle « de la », no trailing orientation) is implemented twice — in
`address-normalize.ts` and in the import script — and must stay in sync;
the spec pins the shared cases.

**Rejected**: matching by municipality name only (Montréal boroughs,
merged municipalities and spelling variants make it unreliable) and
full-text search extensions (`pg_trgm`/`unaccent` are not needed for an
exact match on a normalised key).

### 4. Geocoding is automatic and behind a contract

`common/contracts/geocoder.contract.ts` (`GEOCODER`, `IGeocoder`) is bound
by the `@Global()` `GeoModule`, like `SYSTEM_CONFIG_RESOLVER`. `clients`
calls it fire-and-forget after an address is created or its postal parts
change without explicit coordinates; `dispatch-map` keeps its sweep
(button + new 10-minute cron). Adresses Québec is tried first for Québec
addresses (civic number must match, score ≥ 90), Nominatim otherwise.

**Rejected**: `clients` importing the `geo` module (ADR-001) and an event
round-trip (`clients.address.created` → geo writes `client_addresses`):
the module that owns the row should be the one writing coordinates.

### 5. Coordinates chosen through the autocomplete are trusted; manual edits clear them

The form stores `latitude`/`longitude` when a suggestion is picked. If the
user then edits number, street, city or postal code by hand, the form
clears them and the backend re-geocodes on save. Coordinates are never
kept for an address they no longer describe.

## Not in v1

- Caching Adresses Québec suggestions server-side (add if 429s appear).
- Reverse geocoding (GPS → address) for technicians on site.
- Quarterly roll updates (MAMH publishes them; yearly is enough for a
  property sheet).
- Displaying the property sheet on the client page and the address
  library (only work-order detail pages in v1).
