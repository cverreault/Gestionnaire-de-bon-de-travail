# ADR-NNN: Titre court et descriptif

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Proposed \| Accepted \| Deprecated \| Superseded by ADR-XXX |
| **Date**    | YYYY-MM-DD                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | architecture, security, performance, etc. |
| **Depends on** | [ADR-XXX](ADR-XXX-...md) (optionnel) |

## Context

Décris **le problème** que l'ADR cherche à résoudre. Quel constat amène à devoir trancher ? Quelles sont les contraintes (techniques, métier, légales, budgétaires) ? Quel comportement actuel pose problème ?

**Toujours commencer par le contexte avant la décision.** Une ADR sans contexte est inutile six mois plus tard.

---

## Decision

Énonce **la décision retenue en une phrase claire** au début, puis détaille.

> Exemple : « Nous adoptons un Modular Monolith en Clean Architecture, où chaque module a son propre schéma Postgres et communique uniquement via events. »

### 1. Sous-décision A

Détail de la première sous-décision avec justifications.

### 2. Sous-décision B

…

### 3. Hors scope

Liste explicite de ce qui n'est **pas** décidé par cette ADR (pour éviter les interprétations).

---

## Consequences

### Positives
- Liste ce qui s'améliore (clarté, performance, sécurité, maintenabilité…).

### Négatives / Trade-offs
- Liste ce qui devient plus coûteux ou plus complexe.
- Liste les invariants que l'équipe doit maintenir (sinon l'ADR perd sa valeur).

### Risques
- Quels sont les angles morts ? Sous quelles conditions cette ADR pourrait devoir être révisée ?

---

## Alternatives considered

Pour chaque alternative considérée :

### Alternative X : nom court
**Pour** : ce qui plaide en faveur.
**Contre** : ce qui plaide contre.
**Pourquoi rejetée** : phrase claire.

---

## Implementation notes

- Liens vers les modules concernés.
- Étapes de migration si applicable.
- Tests d'architecture à mettre en place pour garantir le respect de cette ADR.

---

## References
- Liens externes (articles, posts de blog, RFCs).
- ADRs reliées dans ce repo.
