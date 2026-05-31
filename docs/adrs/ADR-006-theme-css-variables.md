# ADR-006: Thème clair/sombre via CSS variables

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | ui, theme, accessibility       |

## Context

L'app a accumulé **725+ références** `theme.colors.X` dans 28 fichiers via inline styles. Implémenter un mode sombre par refacto en React Context impliquerait de toucher tous ces fichiers.

## Decision

### 1. Approche : CSS custom properties

- `frontend/src/index.css` déclare 28 variables sous `:root` (mode clair) et `[data-theme="dark"]` (overrides).
- `frontend/src/theme.ts` mappe chaque couleur à `var(--c-name)`.
- Les inline styles existants (`style={{ color: theme.colors.primary }}`) continuent de fonctionner — le navigateur résout `var(--c-primary)` au runtime.

### 2. Toggle utilisateur

- `frontend/src/context/ui.store.ts` (Zustand) stocke `{ theme: 'light'|'dark'|'system' }`.
- `App.tsx` applique `document.documentElement.setAttribute('data-theme', resolved)` selon le choix.
- `system` suit `prefers-color-scheme` via `matchMedia` (re-évalué quand l'OS change).
- Persistance : `localStorage` pré-login, `User.preferences.theme` post-login (sync via App.tsx).

### 3. Variables additionnelles

Au-delà des couleurs, on a ajouté :
- `--c-successBadgeText`, `--c-successBadgeBorder`, etc. — pour les badges (sinon texte foncé sur fond foncé en dark mode).
- `--c-dangerHover` — pour le hover des boutons destructifs.

### 4. `<meta name="theme-color">`

Mis à jour dynamiquement par `App.tsx` (`#1e40af` clair, `#0f172a` sombre) pour la status bar mobile.

### 5. Hors scope

- Pas de **thèmes personnalisés par client** (uniquement clair/sombre).
- Pas de **picker de couleur** d'accent.

---

## Consequences

### Positives
- **Zéro refacto** des 725 références `theme.colors.X`.
- **Performance** : le browser résout les `var()` natively, pas de re-render React.
- **Évolutivité** : ajouter un thème = ajouter un bloc `[data-theme="X"]` en CSS.

### Négatives / Trade-offs
- **Couleurs hardcodées** dans certains composants (gradients, ombres custom) ne sont pas auto-themed → à refacto si visibles en dark.
- **Lecture moins évidente** : `theme.colors.primary` ne montre plus directement la valeur hex en lisant `theme.ts`.

---

## Alternatives considered

### Alternative A : React Context + thème en TypeScript
**Pour** : Type-safety, refactoring assisté par TS.
**Contre** : 725 imports à refacto, re-renders inutiles à chaque toggle.
**Rejetée** : disproportion coût/bénéfice.

### Alternative B : Tailwind dark mode
**Pour** : Standard industrie, classes utilitaires.
**Contre** : Migration complète de tout le styling existant.
**Rejetée** : trop lourd à introduire en cours de route.

---

## Implementation notes
- `frontend/src/index.css` : déclarations `:root` + `[data-theme="dark"]`
- `frontend/src/theme.ts` : conversion hex → `var(--c-*)`
- `frontend/src/context/ui.store.ts` : Zustand store `{ theme, locale }`
- `frontend/src/App.tsx` : useEffect qui applique `data-theme` et `<meta name="theme-color">`
- `frontend/src/pages/ProfilePage.tsx` : section `AppearanceSection` (3 boutons Clair/Sombre/Auto)

## References
- [CSS Custom Properties — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
