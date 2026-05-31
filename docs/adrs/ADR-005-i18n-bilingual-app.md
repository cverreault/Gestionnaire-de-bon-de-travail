# ADR-005: Internationalisation bilingue FR/EN

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | i18n, ux                       |

## Context

Marché cible : PME canadiennes francophones (Québec, Acadie) avec parfois des techniciens anglophones. Nécessité d'avoir FR comme langue par défaut, EN comme alternative.

## Decision

### 1. Stack

| Couche | Lib | Format |
|---|---|---|
| Frontend | `react-i18next` + `i18next-browser-languagedetector` | JSON par namespace |
| Backend | `nestjs-i18n` (résolveurs Accept-Language, query `?lang=`) | JSON par namespace |

### 2. Structure des fichiers

```
frontend/src/locales/
  ├── fr/
  │   ├── common.json       # actions, labels, validation (boutons OK/Annuler/...)
  │   ├── nav.json          # sidebar, menus
  │   ├── auth.json         # login, profil
  │   ├── workOrders.json   # BT, statuts, transitions
  │   ├── clients.json
  │   ├── addresses.json
  │   ├── settings.json
  │   └── errors.json
  └── en/  (mêmes fichiers)

backend/src/i18n/
  ├── fr/
  │   ├── validation.json   # messages class-validator
  │   ├── errors.json       # exceptions métier
  │   └── settings.json
  └── en/
```

### 3. Convention de clés

- `namespace:section.key` (ex: `workOrders:fields.title`)
- camelCase (pas de snake_case dans les clés)
- Pour les pluriels : `i18next` plural form (`_one`, `_other`)
  ```json
  { "activeCount_one": "{{count}} BT actif", "activeCount_other": "{{count}} BT actifs" }
  ```

### 4. Persistance de la langue

- **Pré-login** : `localStorage` (clé `taskmgr-ui` via Zustand)
- **Post-login** : `User.preferences.locale` (JSONB) sync avec le store local
- App.tsx hydrate au login, push à chaque changement

### 5. Format des erreurs API

- Frontend axios ajoute `Accept-Language: fr|en` à chaque requête
- Backend `nestjs-i18n` résout via `HeaderResolver`, fallback `fr`
- DTOs utilisent `i18nValidationMessage('validation.NOT_EMPTY')` au lieu de strings hardcodées
- Services métier utilisent `i18n.t('errors.PREFIX_TAKEN', { args: { prefix } })` pour les exceptions

### 6. Dates et nombres

Helper centralisé `frontend/src/utils/dateFormat.ts` :
- `formatDate(date)` → `fr-CA` ou `en-CA` selon la locale courante
- `formatDateTime(date)`
- `currentDateFnsLocale()` → pour `date-fns` (`fr` ou `enCA`)

### 7. Hors scope

- Pas d'autres langues que FR/EN en v1.
- Pas de **gestion de contenus traduits par les utilisateurs** (ex: nom d'un Type de tâche traduit). Si besoin, ajouter JSONB `{ fr: "...", en: "..." }` sur l'entité.

---

## Consequences

### Positives
- **Marché canadien** servi natif (FR/EN sans plugin externe).
- **Backend traduit les erreurs** → UX cohérente même pour les validations API.
- **Fallback gracieux** : si une clé manque en EN, fallback FR au lieu de planter.

### Négatives / Trade-offs
- **Maintenance double** : chaque nouvelle string doit être ajoutée dans 2 JSON.
- **Risque d'oubli** : `defaultValue` dans `t('key', { defaultValue: 'Fr texte' })` permet de prototyper, mais à nettoyer.
- **Bundle size** : ~8 namespaces × 2 langues = ~16 fichiers à parser au boot. Acceptable (~50 KB total).

### Risques
- **Divergence FR/EN** : un texte change en FR mais pas en EN → traduction obsolète. Mitigation : revue PR systématique des changements `locales/`.

---

## Alternatives considered

### Alternative A : Lingui (extraction automatique)
**Pour** : Extraction des `<Trans>` automatique.
**Contre** : Plus de tooling, plus de build steps.
**Rejetée** : i18next plus standard.

### Alternative B : Backend en EN, frontend traduit tout
**Pour** : Backend plus simple.
**Contre** : Erreurs API en anglais sont UX médiocre pour un user FR.
**Rejetée** : on veut une UX cohérente bout-en-bout.

---

## Implementation notes
- Configuration i18next : `frontend/src/i18n.ts` (avec lazy-load possible si bundle grossit)
- Configuration nestjs-i18n : `backend/src/app.module.ts` (loader `loaderOptions.path: 'i18n/'`)
- Axios intercepteur : `frontend/src/services/api.ts` ajoute `Accept-Language`
- App.tsx synchronise store ↔ User.preferences ↔ i18n.language

## References
- [react-i18next docs](https://react.i18next.com/)
- [nestjs-i18n docs](https://nestjs-i18n.com/)
