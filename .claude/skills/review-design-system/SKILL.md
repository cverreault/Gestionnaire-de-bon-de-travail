---
name: review-design-system
description: Review hat — frontend design-system & convention compliance for TaskMgr. Reuse theme.ts presets over ad-hoc styles, theme tokens not raw hex, i18n for all user-visible text, responsive + dark-mode-safe, reuse shared components. A code-review lens.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(git *)
---

# Frontend design-system compliance review hat

**Applies when:** `frontend/src/**/*.tsx`, `frontend/src/**/*.ts`

Review the diff ONLY through the frontend-convention lens. Binding sources: [CLAUDE.md](../../../CLAUDE.md)
(Conventions), [ADR-005 i18n-bilingual-app](../../../docs/adrs/ADR-005-i18n-bilingual-app.md),
[ADR-006 theme-css-variables](../../../docs/adrs/ADR-006-theme-css-variables.md).

TaskMgr styles components with **inline styles composed from `theme.ts` presets** — there are no
per-component CSS class files. The question this hat asks: did the change **reuse the theme + shared
components**, or **duplicate / bypass** them?

## Flag (with `file:line`)

- **Raw hex / hardcoded colour** in a component instead of a theme token — use `theme.colors.*`
  (which resolve to the `var(--c-*)` CSS variables, so light/dark both work). A raw `#3b82f6`
  inline hardcodes one theme and breaks dark mode. Sanctioned exceptions: status/domain colours
  that come from data (e.g. a process-status `color` from the API, a map marker) and `#fff`/`#000`
  on a deliberately fixed surface. **blocker** (breaks dark mode) when it's a UI chrome colour.
- **Ad-hoc inline style duplicating a `theme.ts` preset** — reuse `buttonStyles`, `cardStyles`,
  `formStyles` (`input`/`select`/`textarea`/`label`), `tableStyles`, `modalStyles`, `layoutStyles`,
  `badgeStyles` instead of re-deriving the same padding/border/radius by hand. If a genuinely
  generic preset is missing, ADD it to `theme.ts` rather than copy it per file. **warn**.
- **A shared component re-implemented locally** — reuse the existing ones
  (`WorkOrderStatusBadge`, `BilingualInput`, `SignaturePad`, `Flag`, `WorkOrderPartsSection`,
  layout shells under `components/layouts/`, `LoadingSpinner`, toast via `context/toast.store`)
  instead of a local copy. **blocker** for a duplicated generic control; **warn** for near-duplicates.
- **Hardcoded user-visible French/English string** instead of an i18n key — all UI text goes through
  `react-i18next` (`t('ns:key')`) with FR + EN entries in `frontend/src/locales/{fr,en}/<ns>.json`,
  the namespace registered in `i18n.ts`. Bilingual config data uses the `nameFr`/`nameEn` pair.
  **blocker** (untranslated UI).
- **A `Record<Enum, …>` map (status/role labels, colours) missing a case** after an enum grew — it
  won't compile, but flag it here too since it's the usual source of a broken badge/filter. **warn**.
- **Non-responsive layout** — a fixed multi-column grid that will overflow on mobile; prefer the
  `useBreakpoint()` hook + `theme.breakpoints`, `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`,
  or let the global `!important` media rules in `index.css` collapse it. Tables must live in an
  `overflow-x` container. **warn**.
- **Dates/numbers not locale-formatted** — use `utils/dateFormat.ts`, not `toLocaleString` ad-hoc. **nit**.
- **Frontend calling the DB or bypassing `services/*`** — all data access goes through `/api/*`
  via the `services/` axios layer + React Query hooks; no direct fetch scattered in components. **warn**.

## Don't flag

- Genuinely feature-specific UI living in its page/component folder.
- Data-driven colours (process-status `color`, map paint) applied inline from an API value.
- `#fff` / `#000` on a deliberately fixed surface (e.g. the white logo chip).
- React Query, Zustand, axios, react-i18next — these ARE the sanctioned stack here.

## Report

Return each finding as `file:line — issue — fix`, with severity. If the diff is clean on this
lens, say so.
