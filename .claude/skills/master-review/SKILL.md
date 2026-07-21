---
name: master-review
description: Revue complète orchestrée de la branche courante pour TaskMgr — route le diff vers les lentilles spécialisées (sécurité, frontières, commentaires, design-system) en parallèle, agrège en une seule liste de triage avec sévérités, et propose des correctifs groupés. Sans Codex.
argument-hint: [base-ref — défaut origin/main]
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(gh *) Read Grep Glob Edit Write Agent
---

# Master Review — orchestrateur des lentilles de revue

Lance **une seule commande** qui passe le diff de la branche par toutes les lentilles de revue
applicables, agrège tout en un rapport unique, et propose d'appliquer les correctifs. C'est le
pendant local et gratuit de `/codex-review` — **aucun appel à Codex** (revue par le même modèle,
mais éclatée en perspectives spécialisées indépendantes).

Les lentilles orchestrées (chacune est un skill autonome, réutilisable seul) :
- **review-security** — RBAC/@Roles, tenant isolation, injection, secrets, PII (ADR-004/009)
- **review-boundaries** — imports inter-modules, events/contrats, layering (ADR-001/007)
- **review-comments** — commentaires qui narrent, code mort, docs dupliquées
- **review-design-system** — theme.ts, tokens dark-mode, i18n, responsive (ADR-005/006)

## Step 1 — Résoudre la base et le diff

- Base = `$ARGUMENTS` si fourni, sinon `origin/main`. `git fetch origin` d'abord.
- `git diff --stat <base>...HEAD`. Si vide → « rien à revoir » et stop.
- Classe les fichiers touchés : `backend/src/**` (→ security, boundaries),
  `frontend/src/**` (→ security, design-system), tout `.md`/tout fichier (→ comments).

## Step 2 — Lancer les lentilles applicables **en parallèle**

Pour chaque lentille dont le périmètre matche des fichiers du diff, lance **un sous-agent** qui
charge le skill correspondant et l'applique au diff. **Maximum 4 sous-agents en parallèle**
(il y a 4 lentilles au total — les lancer toutes d'un coup est exactement la limite, ne pas
dépasser). N'active que celles dont le `Applies when` correspond à des fichiers modifiés.

Chaque sous-agent reçoit : la base ref, la liste des fichiers de son périmètre, et la consigne de
suivre son `SKILL.md` puis de renvoyer ses findings au format `fichier:ligne — problème — correctif`
avec sévérité (blocker / warn / nit).

Si aucune lentille ne s'applique (ex. diff purement docs → seulement review-comments), n'en lance
que celle-là.

## Step 3 — Agréger en une liste de triage unique

Fusionne les findings de toutes les lentilles. **Dédoublonne** (même fichier:ligne remonté par deux
lentilles = une seule entrée, en gardant la sévérité la plus haute et en citant les deux angles).
Trie par sévérité :

| # | Sévérité | Lentille | Fichier:Ligne | Problème | Correctif proposé |
|---|----------|----------|---------------|----------|-------------------|
| B1 | blocker | security | `file.ts:42` | … | … |

Sévérités : **blocker** (ADR violée, sécurité, correctness) → **warn** (convention, couplage) →
**nit** (style).

## Step 4 — Proposer des correctifs groupés

Ne pas dérouler les findings un par un. Présenter 3-4 options groupées (comme `/fix-review`) :

- **A) Quick wins** — tous les blockers + nits (rapides, non controversés)
- **B) Tous les correctifs de code** — blockers + warns + nits
- **C) Blockers seulement** — le minimum pour être mergeable
- **D) Custom** — l'utilisateur choisit à la pièce

Attendre le choix. Puis appliquer les correctifs retenus (Edit/Write), et pour un changement de
comportement, re-vérifier via le build/tests concernés (`docker compose up --build -d`, `npm test`).

## Step 5 — Rapport

- Tableau de triage agrégé (ou « ✅ propre sur toutes les lentilles » si rien).
- Ce qui a été corrigé cette session (`git diff` des fichiers touchés en Step 4).
- Ce qui reste (déféré) + toute permission refusée.
- Rappel : pour une revue indépendante par un **autre modèle**, `/codex-review` existe (nécessite
  `codex login`) — non lancé ici par design.

Ne jamais marquer un finding comme réglé sans l'avoir corrigé ou explicitement déféré.
