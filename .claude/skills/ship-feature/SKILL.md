---
name: ship-feature
description: Finaliser une feature en respectant le process : tests verts, conventional commit, push, ouvrir PR.
argument-hint: <feature-description>
---

# Ship Feature

Tu finalises la feature : **$ARGUMENTS**.

> Pré-requis : la feature est implémentée et testée localement. Cette skill orchestre le « ship » (commit, push, PR).

---

## Step 1 — Vérifier l'état

```bash
git status --short
git diff --stat
```

Confirme à l'utilisateur la liste de fichiers à committer. Si des fichiers indésirables apparaissent (build artifacts, `.env`, fichiers .swp), **stop** et demande clarification.

## Step 2 — Lancer la review automatique

Invoque la skill `review-changes` (cf. `.claude/skills/review-changes/SKILL.md`) pour valider :
- Respect des ADRs
- Tests passent
- Build passe
- Pas de secret

Si la review remonte des **bloqueurs**, **stop** et demande à l'utilisateur de corriger.

## Step 3 — Commit conventionnel

Format : `{type}({scope}): {subject}`

| type | quand |
|---|---|
| `feat` | nouvelle feature visible utilisateur |
| `fix` | correction de bug |
| `refactor` | restructuration sans changer le comportement |
| `test` | ajout/modification de tests |
| `docs` | documentation (ADR, README, CLAUDE.md) |
| `chore` | dépendances, config, build |
| `style` | formatting, lint |

`scope` = nom du module (`work-orders`, `clients`, `process`, ...) ou `infra` pour transverse.

**Subject** : en français ou anglais (suivre la convention du repo), à l'impératif, ≤ 70 caractères.

**Body** (optionnel) :
- Le « pourquoi », pas le « quoi »
- Liens vers issue/ADR si applicable
- Liste à puces si plusieurs changements connexes

Exemple :
```
feat(work-orders): ajout du clonage du processus par défaut à la création

Avant : les nouveaux processus étaient vides → l'admin devait recréer
les statuts/transitions un par un.

Après : tout nouveau processus est cloné depuis celui marqué isDefault.
L'admin n'a plus qu'à ajuster ce qui change.

Refs : ADR-003 (Moteur de répartition)
```

**Commande** :
```bash
git add {files}    # PAS git add -A : éviter de prendre des fichiers indésirables
git commit -m "$(cat <<'EOF'
feat(...): ...

...

Refs : ADR-XXX
EOF
)"
```

## Step 4 — Push

Si la branche n'est pas encore poussée :
```bash
git push -u origin {branch-name}
```

Si elle existe déjà :
```bash
git push
```

**Jamais `--force` sans demander explicitement** (sauf sur une branche personnelle non encore mergée).

## Step 5 — Ouvrir la PR

Via `gh` :

```bash
gh pr create \
  --title "feat(scope): {sujet}" \
  --body "$(cat <<'EOF'
## Résumé
- 1-3 puces qui décrivent ce qui change.

## ADRs / Module specs concernés
- [ADR-XXX](docs/adrs/ADR-XXX-...md)
- [docs/modules/{module}.md](docs/modules/{module}.md)

## Tests
- [ ] Unit tests : couverts
- [ ] Integration tests : couverts
- [ ] Smoke test manuel : vérifié sur localhost

## Checklist review
- [ ] Conforme aux ADRs (ADR-001, ADR-003 si dispatch)
- [ ] i18n : clés FR et EN à jour
- [ ] Permissions testées
- [ ] Pas de hex hardcodé
- [ ] Migration Prisma incluse si schéma modifié

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Returner l'URL de la PR à l'utilisateur.

## Step 6 — Annoncer

Format final :
- Titre PR + URL
- Résumé en 2-3 phrases
- Notes pour le reviewer (zones critiques à regarder)
- TODOs en suspens à mentionner dans la PR description

---

## Cas spéciaux

### Première PR sur le repo
- Vérifier qu'il y a un `main` upstream
- `gh pr create --base main` explicitement

### Hot-fix urgent
- Branche `hotfix/{description}` depuis `main`
- Commit type `fix(scope): ...`
- PR avec label `urgent` si gh CLI supporte

### Refacto sans changement de comportement
- Type `refactor(scope): ...`
- Insister dans la description que **comportement utilisateur inchangé**
- Tests existants doivent passer sans modification (sinon c'est pas un refacto pur)

### Documentation seulement
- Type `docs(scope): ...`
- Pas besoin de rebuilder backend/frontend
- Mais lire les changements pour cohérence (liens cassés, etc.)
