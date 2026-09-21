#!/usr/bin/env bash
# Publie l'APK de test sous un nom versionné (downloads/dispatch2go-<version>.apk),
# garde l'alias downloads/dispatch2go.apk (lien partagé) pointé sur la dernière version,
# supprime les anciennes versions et écrit downloads/version.json que l'app Android
# hors store lit pour proposer la mise à jour (mobile/src/update).
#
#   scripts/mobile/publish-apk.sh [chemin/app-release.apk] [notes]
#
# Sans chemin : reprend downloads/dispatch2go.apk déjà copié par scp (ou l'APK versionné
# courant) et ne fait que renommer / régénérer version.json. La version vient de
# mobile/app.config.ts (même commit que le build) ; APK_VERSION=x.y.z la force.
# KEEP_OLD=1 conserve les anciens fichiers versionnés.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/downloads"
APK_SRC="${1:-}"
NOTES="${2:-}"
BASE_URL="${PUBLIC_BASE_URL:-https://www.dispatch2go.com}"

VERSION="${APK_VERSION:-$(grep -oP "version:\s*'\K[0-9]+\.[0-9]+\.[0-9]+" "$ROOT/mobile/app.config.ts" | head -1)}"
[[ -n "$VERSION" ]] || { echo "Version introuvable dans mobile/app.config.ts" >&2; exit 1; }
FILE="dispatch2go-$VERSION.apk"
DEST="$DIR/$FILE"
ALIAS="$DIR/dispatch2go.apk"

if [[ -n "$APK_SRC" ]]; then
  cp "$APK_SRC" "$DEST"
elif [[ -L "$ALIAS" && ! -f "$DEST" ]]; then
  # scp écrit À TRAVERS le lien symbolique : le fichier fraîchement déposé est la
  # cible de l'alias (nom de l'ancienne version). On le renomme en version courante.
  TARGET="$(readlink -f "$ALIAS")"
  [[ -f "$TARGET" ]] && mv "$TARGET" "$DEST"
elif [[ -f "$ALIAS" && ! -L "$ALIAS" ]]; then
  # Fichier brut déposé par scp sous le nom de l'alias : on le renomme.
  mv "$ALIAS" "$DEST"
fi
[[ -f "$DEST" ]] || { echo "APK introuvable : $DEST (copie-le par scp sous downloads/dispatch2go.apk ou passe son chemin)" >&2; exit 1; }

# Alias stable pour le lien partagé → dernière version.
ln -sfn "$FILE" "$ALIAS"

# Une seule version servie : les anciennes partent (KEEP_OLD=1 pour les garder).
if [[ "${KEEP_OLD:-0}" != "1" ]]; then
  for old in "$DIR"/dispatch2go-*.apk; do
    [[ "$old" == "$DEST" ]] || { echo "Ancienne version retirée : $(basename "$old")"; rm -f "$old"; }
  done
fi

# Notes : si absentes et que version.json décrit déjà cette version, on les garde.
if [[ -z "$NOTES" && -f "$DIR/version.json" ]]; then
  NOTES="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1]))['android']; print(d.get('notes','') if d.get('version')==sys.argv[2] else '')" "$DIR/version.json" "$VERSION")"
fi

SIZE="$(stat -c %s "$DEST")"
SHA="$(sha256sum "$DEST" | cut -d' ' -f1)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$DIR/version.json" "$VERSION" "$BASE_URL/downloads/$FILE" "$FILE" "$SIZE" "$SHA" "$NOW" "$NOTES" <<'PY'
import json, sys
out, version, url, file, size, sha, now, notes = sys.argv[1:9]
json.dump({"android": {"version": version, "url": url, "file": file, "size": int(size), "sha256": sha, "publishedAt": now, **({"notes": notes} if notes else {})}}, open(out, "w"), indent=2, ensure_ascii=False)
open(out, "a").write("\n")
PY
echo "Publié : version $VERSION, $((SIZE / 1024 / 1024)) Mo → $BASE_URL/downloads/$FILE (alias dispatch2go.apk)"
cat "$DIR/version.json"
