---
name: review-changes
description: Revoir les changements de la branche courante contre les ADRs et conventions de TaskMgr avant commit/PR.
argument-hint: [--base main]
---

# Review Changes

Tu fais une **revue d'architecture et de qualité** des changements de la branche courante.

> Objectif : intercepter les déviations par rapport aux ADRs/conventions **avant** qu'elles ne soient mergées.

---

## Step 1 — Inventaire

```bash
git status --short
git diff --stat $ARGUMENTS HEAD  # défaut : main
git log --oneline $ARGUMENTS..HEAD
```

Identifie :
- Nombre de fichiers touchés
- Modules concernés
- Type de changement (feature, fix, refactor, docs)

## Step 2 — Vérifier le respect des ADRs

### ADR-001 : Modular Monolith

- [ ] **Aucun import direct** entre modules métier ? Cherche `import.*from.*\.\./{other-module}` dans les diffs.
- [ ] Les couches sont respectées ? (controller → service, service → repository, pas l'inverse)
- [ ] Les events de domaine sont publiés via `EventEmitter2` (pas un appel direct au service receveur) ?
- [ ] Le `common/` ne contient pas de logique métier d'un module spécifique ?

### ADR-003 : Moteur de répartition

- [ ] Aucune transition de `WorkOrder.currentStepId` directement en Prisma — toujours via `ProcessEngineService` ?
- [ ] Les events `workOrders.workOrder.*` sont publiés à chaque changement de statut ?
- [ ] Si un nouveau champ est ajouté à `WorkOrder`, ses implications sur les transitions sont documentées ?

### ADR-004 : Auth

- [ ] Chaque nouvelle route a un `@Roles(...)` ou explicitement `@Public()` ?
- [ ] Les tokens ne sont jamais loggés (chercher `console.log.*token`, `logger.*authorization`) ?
- [ ] Le filtrage par technicien (TECH ne voit que ses BT) est appliqué côté service ?

### ADR-005 : i18n

- [ ] Aucune chaîne FR/EN hardcodée dans le JSX (chercher `>[A-ZÀ-Ü][a-zà-ü ]+<` dans les `.tsx`) ?
- [ ] Les nouveaux DTOs utilisent `i18nValidationMessage('validation.XXX')` plutôt qu'une string directe ?
- [ ] Les clés ajoutées en `fr.json` existent aussi en `en.json` ?

### ADR-006 : Thème

- [ ] Aucun hex couleur hardcodé dans les composants (chercher `#[0-9a-fA-F]{3,6}` hors `theme.ts` et `index.css`) ?
- [ ] Les nouvelles couleurs passent par une variable CSS (`var(--c-X)`) ?

## Step 3 — Vérifier les conventions de code

- [ ] **Nommage fichiers** : kebab-case ?
- [ ] **Tables DB** : snake_case pluriel via `@map` ?
- [ ] **Pas de `any` non justifié** dans le code TS ?
- [ ] **DTOs typés explicitement** (pas `Record<string, unknown>` partout) ?

## Step 4 — Vérifier les tests

```bash
cd backend && npm test
cd frontend && npm test
```

- [ ] Les tests passent ?
- [ ] Les changements de logique sont couverts par un test ? (un service modifié = un test à mettre à jour)
- [ ] Les permissions sont testées (un test qui vérifie 403 pour rôle insuffisant) ?

## Step 5 — Vérifier build et migrations

```bash
docker compose up --build -d backend frontend
docker logs taskmgr_backend --since 1m | grep -iE "error|exception" | grep -v "ExternalClient"
```

- [ ] Build backend passe ?
- [ ] Build frontend passe ?
- [ ] Si schéma Prisma modifié, migration créée (`backend/prisma/migrations/{stamp}_{name}/`) ?

## Step 6 — Vérifier i18n

```bash
# Comparer les clés FR et EN
for ns in common nav auth workOrders clients addresses settings errors; do
  fr_keys=$(jq -r '.. | objects | keys[]' frontend/src/locales/fr/$ns.json 2>/dev/null | sort -u)
  en_keys=$(jq -r '.. | objects | keys[]' frontend/src/locales/en/$ns.json 2>/dev/null | sort -u)
  diff <(echo "$fr_keys") <(echo "$en_keys") && echo "  $ns: OK" || echo "  $ns: ⚠️ divergence"
done
```

- [ ] Aucune divergence entre FR et EN ?

## Step 7 — Sécurité

- [ ] **Pas de secret commité** : `git diff $ARGUMENTS HEAD -- '**/.env*'` (devrait être vide ou juste `.env.example`)
- [ ] **Pas de log de mot de passe / token** : grep les diffs
- [ ] **Validation backend** : pas de confiance aveugle au frontend (chercher endpoints qui acceptent des champs sans `class-validator`)
- [ ] **Headers de sécurité** : pas désactivés sans raison documentée

## Step 8 — Rapport

Rapporte :

**✅ Conforme** : ce qui respecte les ADRs et conventions.

**⚠️ À corriger avant merge** : déviations critiques (ADR violée, sécurité, type-check qui passe pas).

**💡 Suggestions** : améliorations non bloquantes (nommage, refactor, ajout de test).

**❓ Questions** : zones ambiguës qui méritent une discussion architecturale (potentiellement nouvelle ADR).

Format court (≤ 300 mots). Cite les fichiers et lignes problématiques.
