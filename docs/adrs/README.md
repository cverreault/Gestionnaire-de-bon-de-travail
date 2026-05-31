# ADRs — Architecture Decision Records

Ce dossier contient les décisions architecturales structurantes du projet TaskMgr.

> **Lis [ADR-001](ADR-001-modular-monolith-architecture.md) en premier** — c'est la fondation.

## Index

| ADR | Statut | Sujet |
|---|---|---|
| [001](ADR-001-modular-monolith-architecture.md) | Accepted | Modular Monolith en Clean Architecture |
| [002](ADR-002-tech-stack-selection.md) | Accepted | Sélection de la stack technologique |
| [003](ADR-003-dispatch-engine.md) | Accepted | Moteur de répartition de tâches |
| [004](ADR-004-authentication-authorization.md) | Accepted | Authentification et autorisation (JWT + rôles) |
| [005](ADR-005-i18n-bilingual-app.md) | Accepted | Internationalisation bilingue FR/EN |
| [006](ADR-006-theme-css-variables.md) | Accepted | Thème clair/sombre via CSS variables |

## Comment écrire une nouvelle ADR

1. Copie `ADR-TEMPLATE.md` → `ADR-{NNN}-{kebab-case-titre}.md`
2. Incrémente le numéro (regarde le dernier numéro utilisé)
3. Remplis les sections : Context, Decision, Consequences, Alternatives
4. Lance un PR avec le label `adr`
5. **Une fois Acceptée**, mets à jour cet index

## Statuts possibles

- **Proposed** : en cours de discussion, pas encore appliquée
- **Accepted** : appliquée, code conforme attendu
- **Deprecated** : ne s'applique plus mais reste comme historique
- **Superseded by ADR-XXX** : remplacée par une autre

## Pourquoi des ADRs ?

Six mois après une décision, personne ne se rappelle **pourquoi** un choix a été fait. Les ADRs documentent :
- Le **contexte** (le problème qu'on essayait de résoudre)
- Les **alternatives** considérées (pour ne pas refaire le tour)
- Les **conséquences** (positives ET négatives — assumées)
- Les **invariants** à maintenir pour que la décision reste valable

Quand une nouvelle décision contredit une ADR, on **écrit une nouvelle ADR qui supersede l'ancienne**, plutôt que de modifier l'ancienne. L'historique des décisions est immuable.
