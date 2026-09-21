# ADR-019 — Routing engine: self-hosted Valhalla on OpenStreetMap Québec

- **Status**: Accepted
- **Date**: 2026-09-21
- **Deciders**: cverreault
- **Supersedes**: —
- **Amends**: ADR-018 (address reference) — adds the routing layer on top of geocoding

## Context

Dispatchers needed driving times to order a technician's day (the map only
had a straight-line nearest-neighbour tour), and technicians needed the
distance / ETA to a site before leaving. Google Directions / Distance Matrix
would have done it, but at a per-request price, with a key to manage per
tenant, and with client addresses sent to a third party. The stack is
self-hosted by design (ADR-001, ADR-018 already imports the Québec address
reference locally).

## Decisions

1. **Valhalla, self-hosted, in the compose stack** (`ghcr.io/gis-ops/docker-valhalla`), fed with the Geofabrik Québec extract, tiles built once into the `taskmgr_valhalla_data` volume, internal network only (`VALHALLA_URL`, default `http://valhalla:8002`). Costing `auto` (car).
   - **Rejected**: Google Directions / Distance Matrix (cost, key, data leaves the server) ; OSRM (no matrix + optimisation combo out of the box, one profile per instance, RAM-hungry) ; GraphHopper (Java, licence for the route optimisation API) ; Mapbox (same objections as Google).
2. **Contract `ROUTER` in `common/contracts/router.contract.ts`** (`route`, `matrix`, `status`), implemented by `geo/infrastructure/valhalla.client.ts`, bound by the `@Global()` GeoModule like `GEOCODER`. Consumers never import `geo`.
   - **Rejected**: calling Valhalla from `dispatch-map` directly (two HTTP clients, no fallback policy).
3. **Degrade, never fail** : every router call returns `null` when the engine is unreachable or still building ; `dispatch-map` falls back to the straight-line heuristic and tags the answer `engine: 'haversine'` so the UI says so ; the app simply hides the ETA line.
4. **Tour ordering = matrix + 2-opt, then one route** : `sources_to_targets` on real driving times, open-path nearest-neighbour + 2-opt (`route-optimizer.ts`, start fixed at the technician's last position, end free), then `/route` through the ordered stops for legs and road geometry.
   - **Rejected**: Valhalla `optimized_route` alone (fixes the last stop as the end : round trips only).
5. **Navigation stays in the phone's maps app** : the app shows distance and ETA from the engine, then hands over to Apple Plans / Google Maps for turn-by-turn. In-app turn-by-turn (map SDK, voice, rerouting) is out of scope for v1.

## Consequences

- First start downloads ~1.1 GB and builds tiles for 30–60 min (8 cores, ~4 GB RAM) ; the API works meanwhile in fallback mode. Refresh the data by deleting the volume (or `force_rebuild=True`) ; monthly is plenty.
- Coverage = the extract : another province means another `VALHALLA_TILE_URLS`.
- No traffic data : ETAs are free-flow estimates.

## Not in v1

- Time windows / working hours in the tour, multi-vehicle assignment.
- In-app turn-by-turn navigation.
- Isochrones (« who can be on site within 30 min »).
