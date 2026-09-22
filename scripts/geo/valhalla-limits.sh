#!/bin/bash
# Relève les limites de service de Valhalla dans le volume taskmgr_valhalla_data
# (config générée par l'image gis-ops au premier démarrage, puis réutilisée).
# À relancer après un rafraîchissement des cartes (volume recréé).
#   auto.max_matrix_distance : 400 km → 1 500 km par paire (tournées Abitibi/Gaspésie ↔ Montréal)
#   auto.max_locations       : 20 → 60 points par itinéraire (tournée jusqu'à 50 BT + départ)
set -euo pipefail
CONTAINER=${VALHALLA_CONTAINER:-taskmgr_valhalla}
docker exec -i -u root "$CONTAINER" python3 - <<'PY'
import json
p = '/custom_files/valhalla.json'
cfg = json.load(open(p))
auto = cfg['service_limits']['auto']
auto['max_matrix_distance'] = 1500000.0
auto['max_locations'] = 60
json.dump(cfg, open(p, 'w'), indent=2)
print('valhalla.json patched: auto.max_matrix_distance=1500 km, auto.max_locations=60')
PY
docker restart "$CONTAINER" >/dev/null
echo "Valhalla redémarré — vérifier : docker exec taskmgr_backend wget -qO- http://valhalla:8002/status"
