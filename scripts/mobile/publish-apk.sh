#!/usr/bin/env bash
# Publie l'APK de test : copie (optionnelle) dans downloads/ et écrit downloads/version.json
# que l'app Android hors store lit pour proposer la mise à jour (mobile/src/update).
#
#   scripts/mobile/publish-apk.sh [chemin/app-release.apk] [notes]
#
# Sans argument : réutilise downloads/dispatch2go.apk déjà copié (scp) et ne fait que
# régénérer version.json. La version vient de mobile/app.config.ts (même commit que le build).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APK_SRC="${1:-}"
NOTES="${2:-}"
DEST="$ROOT/downloads/dispatch2go.apk"
BASE_URL="${PUBLIC_BASE_URL:-https://www.dispatch2go.com}"

if [[ -n "$APK_SRC" ]]; then
  cp "$APK_SRC" "$DEST"
fi
[[ -f "$DEST" ]] || { echo "APK introuvable : $DEST" >&2; exit 1; }

# APK_VERSION=x.y.z force la version quand l'APK ne vient pas du commit courant.
VERSION="${APK_VERSION:-$(grep -oP "version:\s*'\K[0-9]+\.[0-9]+\.[0-9]+" "$ROOT/mobile/app.config.ts" | head -1)}"
SIZE="$(stat -c %s "$DEST")"
SHA="$(sha256sum "$DEST" | cut -d' ' -f1)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$ROOT/downloads/version.json" "$VERSION" "$BASE_URL/downloads/dispatch2go.apk" "$SIZE" "$SHA" "$NOW" "$NOTES" <<'PY'
import json, sys
out, version, url, size, sha, now, notes = sys.argv[1:8]
json.dump({"android": {"version": version, "url": url, "size": int(size), "sha256": sha, "publishedAt": now, **({"notes": notes} if notes else {})}}, open(out, "w"), indent=2, ensure_ascii=False)
open(out, "a").write("\n")
PY
echo "Publié : version $VERSION, $((SIZE / 1024 / 1024)) Mo → $BASE_URL/downloads/dispatch2go.apk"
cat "$ROOT/downloads/version.json"
