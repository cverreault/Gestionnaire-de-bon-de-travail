# ADRs — Architecture Decision Records

Ce dossier contient les décisions architecturales structurantes du projet TaskMgr.

> **Lis [ADR-001](ADR-001-modular-monolith-architecture.md) en premier** — c'est la fondation.

## Index

| ADR | Statut | Sujet |
|---|---|---|
| [001](ADR-001-modular-monolith-architecture.md) | Accepted | Modular Monolith en Clean Architecture |
| [002](ADR-002-tech-stack-selection.md) | Accepted (amendement proposé par ADR-014) | Sélection de la stack technologique |
| [003](ADR-003-dispatch-engine.md) | Accepted | Moteur de répartition de tâches |
| [004](ADR-004-authentication-authorization.md) | Accepted | Authentification et autorisation (JWT + rôles) |
| [005](ADR-005-i18n-bilingual-app.md) | Accepted | Internationalisation bilingue FR/EN |
| [006](ADR-006-theme-css-variables.md) | Accepted | Thème clair/sombre via CSS variables |
| [007](ADR-007-extension-points-and-contracts.md) | Accepted | Extension points et contrats de module (IDomainEvent, IWorkOrderHook, IModuleRegistration) |
| [008](ADR-008-gps-tracking-privacy.md) | Accepted (amendement proposé par ADR-017) | Suivi GPS opt-in et rétention 7 jours |
| [009](ADR-009-multi-tenancy.md) | Accepted | Multi-tenancy (B6) |
| 010 | — | Numéro non attribué (référencé par les release notes, jamais rédigé) — ne pas réutiliser |
| [011](ADR-011-public-api-authentication.md) | Accepted | Authentification de l'API publique (clés API) |
| [012](ADR-012-outbound-webhooks.md) | Accepted | Webhooks sortants (event subscriptions) |
| [013](ADR-013-alert-rules-engine.md) | Accepted | Moteur de règles d'alertes configurables |
| [014](ADR-014-native-mobile-app-platform.md) | Proposed | App mobile native : React Native + Expo, monorepo, entrée tenant par URL de workspace |
| [015](ADR-015-device-registry-and-native-push.md) | Proposed | Registre d'appareils, push natif via Expo Push Service, sessions par appareil |
| [016](ADR-016-mobile-offline-sync-protocol.md) | Proposed | Protocole de sync hors ligne : pull delta, rejeux idempotents, verrou optimiste |
| [017](ADR-017-mobile-background-gps.md) | Proposed | GPS mobile en arrière-plan : envoi groupé et horodatage client |

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
- **Accepted (amendée par ADR-XXX)** : toujours en vigueur, mais une ADR plus récente en modifie une partie (précisée dans son en-tête `Amends`)

## Pourquoi des ADRs ?

Six mois après une décision, personne ne se rappelle **pourquoi** un choix a été fait. Les ADRs documentent :
- Le **contexte** (le problème qu'on essayait de résoudre)
- Les **alternatives** considérées (pour ne pas refaire le tour)
- Les **conséquences** (positives ET négatives — assumées)
- Les **invariants** à maintenir pour que la décision reste valable

Quand une nouvelle décision contredit une ADR, on **écrit une nouvelle ADR qui supersede l'ancienne**, plutôt que de modifier l'ancienne. L'historique des décisions est immuable.
