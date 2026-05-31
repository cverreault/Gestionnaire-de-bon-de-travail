#!/usr/bin/env bash
# ─── TaskMgr — Script de démarrage ────────────────────────────────────────────
# Usage : ./scripts/start.sh [--no-seed]
#
# Ce script :
#   1. Vérifie les prérequis (docker, docker compose, .env)
#   2. Lance la stack Docker Compose
#   3. Attend que tous les services soient healthy
#   4. Exécute les migrations Prisma
#   5. Exécute le seed si c'est le premier démarrage (sauf --no-seed)
#   6. Affiche les URLs d'accès
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ───────────────────────────────────────────────────────────────────
log()     { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*"; }
error()   { echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Répertoire racine du projet ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ── Arguments ─────────────────────────────────────────────────────────────────
SKIP_SEED=false
for arg in "$@"; do
  case "$arg" in
    --no-seed) SKIP_SEED=true ;;
    *) die "Argument inconnu : $arg. Usage : $0 [--no-seed]" ;;
  esac
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       TaskMgr — Démarrage de la stack    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Vérification des prérequis ─────────────────────────────────────────────
log "Vérification des prérequis..."

command -v docker >/dev/null 2>&1 || die "Docker n'est pas installé."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 n'est pas disponible (commande : 'docker compose')."

success "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
success "Docker Compose $(docker compose version --short)"

# ── 2. Vérification / création du .env ────────────────────────────────────────
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
    warn ".env manquant — copie de .env.example vers .env"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    warn "⚠  Pensez à éditer .env avec vos vraies valeurs avant la mise en production !"
  else
    die ".env et .env.example sont tous les deux absents. Impossible de continuer."
  fi
else
  success ".env trouvé"
fi

# ── 3. Build et lancement de la stack ─────────────────────────────────────────
log "Build et lancement des containers (mode détaché)..."
docker compose up -d --build

success "Containers lancés"

# ── 4. Attente que tous les services soient healthy ───────────────────────────
SERVICES=("taskmgr_postgres" "taskmgr_minio" "taskmgr_backend" "taskmgr_frontend" "taskmgr_nginx")
MAX_WAIT=180   # secondes max par service
POLL_INTERVAL=5

wait_healthy() {
  local container="$1"
  local elapsed=0

  log "Attente du health check : ${BOLD}${container}${NC}..."

  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")

    case "$status" in
      healthy)
        success "${container} est healthy"
        return 0
        ;;
      unhealthy)
        error "${container} est UNHEALTHY. Logs :"
        docker logs --tail 30 "$container" >&2
        die "Service ${container} non opérationnel. Arrêt."
        ;;
      not_found)
        die "Container ${container} introuvable."
        ;;
      *)
        # starting | none
        if (( elapsed >= MAX_WAIT )); then
          error "Timeout (${MAX_WAIT}s) pour ${container}. Logs :"
          docker logs --tail 30 "$container" >&2
          die "Timeout dépassé pour ${container}."
        fi
        printf "."
        sleep "$POLL_INTERVAL"
        (( elapsed += POLL_INTERVAL ))
        ;;
    esac
  done
}

echo ""
for svc in "${SERVICES[@]}"; do
  wait_healthy "$svc"
done
echo ""

success "Tous les services sont opérationnels"

# ── 5. Migrations Prisma ──────────────────────────────────────────────────────
log "Exécution des migrations Prisma..."

# Les migrations sont déjà lancées dans le CMD du Dockerfile backend,
# mais on les rejoue ici pour s'assurer qu'elles ont bien abouti
# (idempotent : ne fait rien si déjà à jour)
if docker compose exec -T backend npx prisma migrate deploy; then
  success "Migrations Prisma appliquées"
else
  die "Échec des migrations Prisma."
fi

# ── 6. Seed (premier démarrage uniquement) ────────────────────────────────────
if [[ "$SKIP_SEED" == "false" ]]; then
  # Détection du premier démarrage : pas d'utilisateur en base
  log "Vérification : premier démarrage ?"

  USER_COUNT=$(docker compose exec -T backend \
    npx prisma db execute --stdin <<< \
    "SELECT COUNT(*) FROM \"User\";" 2>/dev/null \
    | grep -Eo '[0-9]+' | head -1 || echo "0")

  if [[ "$USER_COUNT" == "0" ]]; then
    log "Premier démarrage détecté — exécution du seed..."
    if docker compose exec -T backend npx prisma db seed; then
      success "Seed exécuté avec succès"
    else
      warn "Le seed a échoué ou n'est pas configuré (non bloquant)"
    fi
  else
    log "Base de données déjà peuplée (${USER_COUNT} utilisateur(s)) — seed ignoré"
  fi
else
  warn "Seed ignoré (--no-seed)"
fi

# ── 7. Résumé des URLs ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                   TaskMgr — Accès aux services              ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}  Application    →  ${GREEN}http://localhost:8088${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  API (direct)   →  ${CYAN}http://localhost:3800/api${NC}                ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Swagger        →  ${CYAN}http://localhost:3800/api/docs${NC}           ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Frontend       →  ${CYAN}http://localhost:3801${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  MinIO Console  →  ${CYAN}http://localhost:9011${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  MinIO API      →  ${CYAN}http://localhost:9010${NC}                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  PostgreSQL     →  ${CYAN}localhost:5434${NC}                           ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
success "Stack TaskMgr démarrée avec succès !"
echo ""
echo -e "  Pour arrêter : ${YELLOW}docker compose down${NC}"
echo -e "  Pour les logs : ${YELLOW}docker compose logs -f${NC}"
echo ""
