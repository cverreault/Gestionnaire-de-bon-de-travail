# Feuille de route — Application mobile native technicien

Décisions d'architecture : [ADR-014](../adrs/ADR-014-native-mobile-app-platform.md) (plateforme, monorepo, entrée tenant), [ADR-015](../adrs/ADR-015-device-registry-and-native-push.md) (appareils, push natif, sessions), [ADR-016](../adrs/ADR-016-mobile-offline-sync-protocol.md) (sync hors ligne), [ADR-017](../adrs/ADR-017-mobile-background-gps.md) (GPS arrière-plan). Spec du module backend : [mobile](../modules/mobile.md).

Deux lots : **B37** = contrat backend (module `mobile` + contrats), **B38** = l'app (`mobile/` + `packages/shared/`). Numérotation séparée parce que l'app a son propre job CI, son propre cycle de release (EAS, TestFlight) et ses propres relecteurs ; « B37 terminé » doit vouloir dire « le backend est prêt ».

## Pré-requis hors code (à lancer maintenant, délais incompressibles)

| Pré-requis | Responsable | Pourquoi maintenant |
|---|---|---|
| Activer les comptes Apple Developer Program et Google Play Console (déjà créés) | cverreault | Sans eux : pas de TestFlight, pas de clé APNs, pas de build EAS signé. L'activation Apple prend plusieurs jours |
| Identité de l'app : nom **Dispatch2Go**, bundle id `com.dispatch2go.app` (iOS et Android), schéma `dispatch2go://` | décidé | Se change mal après un premier build distribué |
| Domaine SaaS pour l'entrée par slug (`https://<slug>.<domaine>`) | cverreault | Conditionne le certificat et le champ workspace de l'app |
| Certificat TLS **d'une autorité publique** (Let's Encrypt ou équivalent) couvrant le domaine et le wildcard `*.<domaine>`, terminé sur le nginx frontal | cverreault | iOS et Android refusent un certificat auto-signé sans configuration spéciale ; le `nginx/default.conf` du repo écoute en HTTP seulement, le TLS est donc sur le proxy frontal |
| Déclaration Google Play « localisation en arrière-plan » (formulaire + vidéo de démonstration) | cverreault, à B38.8 | Refus possible ; prévoir le repli « pendant l'utilisation » dans le consentement et le runbook |
| Compte Expo (EAS) et `projectId` | cverreault, à B38.1 | Builds, credentials APNs/FCM, EAS Update |

## Décisions ouvertes (à trancher avant l'item indiqué)

| Décision | Avant | Recommandation |
|---|---|---|
| Version d'Expo SDK figée (conditionne React, expo-sqlite, expo-background-task) | tranché | **Expo SDK 57** (React 19.2, React Native 0.86, TypeScript 6), posé en B38.1 dans `mobile/package.json` |
| Génération des types de `packages/shared` depuis l'OpenAPI du backend (`/api/docs`) plutôt que miroir à la main | B38.2 | Générer avec `openapi-typescript` en script `npm run shared:gen` ; les types manuels restent pour ce que Swagger ne décrit pas |
| Estimation d'effort par item (tailles S/M/L) | avant de planifier un calendrier | À faire ensemble une fois la PR 25 fusionnée |
| Double notification PWA + app | tranché | Un utilisateur avec un appareil actif reçoit le push natif seulement (ADR-015 §3) |

## Périmètre v1

- Persona : **technicien seulement**. Admin et dispatcher restent sur le web.
- Plateformes : iOS + Android, React Native + Expo (managed + dev client, EAS Build).
- Fonctions : hors ligne complet avec file d'opérations idempotentes et gestion des conflits ; GPS arrière-plan avec envoi groupé ; navigation et appel client en un tap ; push natif via Expo Push Service ; caméra avec compression ; signature client au doigt ; scan code-barres / QR pour les pièces.
- Hors v1 : création de BT, édition des champs custom de template, personas dispatcher/admin, universal links sur sous-domaines wildcard, builds EAS en CI.

## B37 — Backend

Conventions : une PR par item, commit conventionnel avec le scope du module touché, migration Prisma obligatoire, `i18nValidationMessage` dans les DTOs, test de permission par endpoint, `npm run arch:check` sans nouvelle exception.

| Item | Scope | Contenu | Dépend de |
|---|---|---|---|
| B37.1 | `docs(adrs)` | ADR-014 à 017, index des ADRs rattrapé, `docs/modules/mobile.md`, cette feuille de route, `CLAUDE.md` | — |
| B37.2 ✅ | `feat(mobile)` | Enums `DevicePlatform`, `PushProvider`, `LocationSource` ; modèles `Device`, `IdempotencyKey` ; `RefreshToken.deviceId?` ; `TechnicianLocation.source` + unique `(technicianId, recordedAt)` ; index `work_orders(tenant_id, assigned_to_id, updated_at)` ; migration ; `TENANT_SCOPED_MODELS` ; TRUNCATE des tests d'intégration | — |
| B37.3 ✅ | `feat(mobile)` | Contrats `device-context` et `mobile-events` ; `RequestContext.deviceId` rempli par `TenantResolverMiddleware` ; squelette du module + `MobileModuleRegistration` ; `DevicesService` / `DevicesController` ; `AuthService` stocke `deviceId` ; listener `@OnEvent('mobile.device.revoked')` dans `auth` ; lignes `roles-matrix.spec.ts` | B37.2 |
| B37.4 ✅ | `feat(notifications)` | Contrat `mobile-push` ; `ExpoPushAdapter` ; `MobilePushService` ; cron receipts ; branche `@Optional()` dans `PushChannelService.send()` ; `notifications.md` | B37.3 |
| B37.5 ✅ | `feat(common)` | Contrat `idempotency` ; décorateur `@Idempotent()` ; interceptor global (replay, 422, 409, 5xx non stocké) ; cron de nettoyage 48 h dans `mobile` ; décorateur posé sur transition, notes, signatures, upload, pièces sur BT | B37.2 |
| B37.6 ✅ | `feat(mobile)` | Touch de l'agrégat dans `WorkOrdersService.createNote/saveSignatures`, `AttachmentsService.upload/remove`, `PartsService` (BT) + `workOrderUpdatedAt` dans les réponses ; `mobile.repository.ts` ; `SyncService` ; curseur ; `SyncController` ; `work-orders.md` | B37.2 |
| B37.7 ✅ | `feat(locations)` | DTO batch ; consentement, clamp, dédup ; `POST /api/me/locations/batch` ; `@Idempotent()` ; `locations.md` | B37.2, B37.5 |
| B37.8 ✅ | `feat(mobile)` | `MobileConfigService` / `MobileConfigController` (`GET /api/mobile/config`) ; heartbeat `upgradeRequired` ; clés `mobile.*` | B37.3 |
| B37.9 ✅ | `feat(attachments)` | `GET /api/attachments/:id/content` (proxy streaming, même RBAC objet que `download`) — livré en PR | — |
| B37.10 | `feat(auth)` | Réinitialisation de mot de passe en libre-service : `POST /api/auth/password-reset/request` (email, réponse neutre) + `POST /api/auth/password-reset/confirm` (token 30 min à usage unique) ; un technicien bloqué sur son téléphone n'a aucun recours aujourd'hui | — |

Parallélisable après B37.2 : {B37.3 → B37.4 → B37.8}, B37.5 → B37.7, B37.6, B37.9. **Lot B37 livré le 2026-09-18 ; ADR 014–017 passées à `Accepted`.**

Pré-requis transverse : `GET /api/auth/me` doit renvoyer `preferences` (thème, locale, gps).

## B38 — Application

Racine du repo : `package.json` (`private`, `workspaces: ["mobile", "packages/*"]`), `package-lock.json` racine, `.easignore`. Backend, frontend, e2e, leurs Dockerfiles, `docker-compose.yml` et leurs lockfiles restent **inchangés**.

`packages/shared` (`@taskmgr/shared`) est consommé en source TypeScript, sans build. Contenu v1 : types domaine technicien, contrats mobile (`SyncPullResponse`, `ProcessSnapshot`, `LocationBatch`, `OPTIMISTIC_LOCK_CONFLICT`), utilitaires purs (`entityLabels`, `addressFormat`, `addressPredominant`, `dateFormat` et `localizedText` avec paramètre `locale`, `phone`, `navigation`), `process/resolveAvailableTransitions`, `sync/project`, locales copiées (`common`, `auth`, `workOrders`, `clients`, `addresses`, `inventory`, `errors`) avec test de parité fr/en. Le backend ne l'importe jamais ; le frontend migre en B38.12.

`mobile/` : Expo SDK stable + dev client, expo-router (`scheme: taskmgr`), Zustand + TanStack Query (lectures en ligne seulement), expo-sqlite + drizzle-orm (source de vérité hors ligne), expo-secure-store (`AFTER_FIRST_UNLOCK`), NetInfo avec `reachabilityUrl` sur `/api/health`, expo-location + expo-task-manager, expo-background-task, expo-notifications, expo-camera (photos + code-barres), expo-image-manipulator (1600 px, qualité 0.8), react-native-signature-canvas, react-i18next + expo-localization, thème light/dark aligné sur `frontend/src/theme.ts`. Client HTTP : port du refresh single-flight de `frontend/src/services/api.ts` ; les tâches d'arrière-plan n'appellent jamais `/auth/refresh`.

Moteur hors ligne (`mobile/src/sync/`) : les lignes serveur ne sont jamais mutées localement ; l'intention locale vit dans `sync_queue` (id = `Idempotency-Key`, `seq`, `kind`, `expected_updated_at`, `status PENDING|IN_FLIGHT|FAILED|CONFLICT`, `attempts`, `local_file_uri`) et est projetée à la lecture. Pull single-flight par pages en transaction, suppressions par différence d'ensembles, `fullResync` purge les tables serveur en gardant la file. Drain séquentiel par `seq` : 2xx → feed-forward de `workOrderUpdatedAt` ; 409 → pull puis retry automatique des opérations additives, `CONFLICT` bloquant pour transition et retrait de pièce ; 4xx → `FAILED` ; 5xx ou transport → backoff et arrêt.

| Item | Scope | Contenu | Dépend de |
|---|---|---|---|
| B38.0 | `spike(mobile)` | Spike jetable : build dev client Expo sur un iPhone et un Android réels avec localisation en arrière-plan et un push de test. Valide comptes, credentials EAS, permissions OS et chaîne d'outils avant d'investir. Aucun code conservé | comptes développeur activés |
| B38.1 ✅ | `chore(mobile)` | Racine workspaces, `.easignore`, squelette `packages/shared`, `create-expo-app mobile` (dev client, router, TS), `metro.config.js`, `jest.config.js`, job CI `mobile`, `.gitignore`, `CLAUDE.md` | — |
| B38.2 | `feat(shared)` | Types, contrats, utilitaires, `resolveAvailableTransitions`, `projectWorkOrder`, locales + test de parité | — |
| B38.3 ✅ | `feat(mobile)` | Shell : router, thème, i18n, écran workspace + branding, device id, secure store, client HTTP + refresh single-flight, login / 2FA / logout, liste et détail de BT en ligne avec transitions, appel et navigation, enregistrement de l'appareil + heartbeat au premier plan (≥ 15 min), écran « mise à jour requise », liste et révocation des appareils sur le profil | B37.3, B37.8 |
| B38.4 ✅ | `feat(mobile)` | Schéma drizzle + migrations (`mobile/drizzle/`, `npm run db:generate`), pull single-flight (session, premier plan, retour réseau, tirer pour rafraîchir), `fullResync`, changement d'utilisateur → purge, snapshots, liste et détail lus depuis SQLite, transitions résolues sur l'appareil ; moteur testé sur better-sqlite3 | B37.6 |
| B38.5 ✅ | `feat(mobile)` | File `sync_queue` (id = Idempotency-Key, seq), projection des ops en attente sur le BT (transitions chaînées hors ligne), drain séquentiel avec `expectedUpdatedAt` propagé, 409 → pull puis rejeu (additif, ≤ 3) ou CONFLICT (transition, bloque le BT), 4xx → FAILED, transport → arrêt ; onglet Sync avec badge, « appliquer quand même » revalidé sur le statut frais, « abandonner » ; moteur testé sur better-sqlite3 | B37.5, B37.6 |
| B38.6 🔶 | `feat(mobile)` | Caméra + compression + upload avec retry, signature, visualisation via le proxy — **caméra / galerie, redimension 1600 px JPEG 0.8, copie dans le sandbox et upload par la file hors ligne, vignettes via le proxy livrés** ; reste : signature | B37.9 |
| B38.7 | `feat(mobile)` | Catalogue et stock dans le pull, ajout / retrait de pièces sur BT, scan, écran Mon stock | B37.6 |
| B38.8 | `feat(mobile)` | Consentement + permissions, tâche d'arrière-plan, table `location_fixes`, envoi groupé, démarrage / arrêt automatique | B37.7 |
| B38.9 | `feat(mobile)` | expo-notifications, enregistrement du token, deep link `dispatch2go://work-orders/:id`, pull à la réception | B37.4 |
| B38.10 | `chore(mobile)` | Flows Maestro, `eas.json` (development / preview / production, EAS Update `appVersion`), `docs/mobile/release.md` | B38.3 à B38.9 |
| B38.11 | `feat(frontend)` | QR code de workspace sur `/profil` (URL du tenant encodée côté client, aucun endpoint) pour l'écran `(setup)/workspace` de l'app | B38.3 |
| B38.12 | `refactor(frontend)` | Le frontend consomme `@taskmgr/shared` (compose `context: .`, alias Vite, suppression des copies) | — |

Ordre : B38.0 → B38.1 → (B38.2 ∥ B38.3) → B38.4 → B38.5 → (B38.6 ∥ B38.7) → B38.8 → B38.9 → B38.10. B38.4 et B38.5 sont le centre de risque et se font avant média et GPS.

### Écrans v1 (`mobile/app/`)

`(setup)/workspace`, `(auth)/login`, `(auth)/two-factor`, onglets `work-orders` (liste Aujourd'hui / À venir / Terminés ; détail avec carte client, transitions, notes, photos, pièces, signature ; modales transition / note / photo / signature / pièces / scan), `stock`, `sync` (état, en attente, conflits, forcer), `profile` (locale, thème, consentement GPS + état de permission, appareils, déconnexion, version), `upgrade-required`.

### Tests et CI

- Unit : jest-expo + testing-library ; le moteur de sync est testé sans natif sur `better-sqlite3` en mémoire avec le même `schema.ts`, HTTP simulé par `msw`.
- Fonctions pures de `packages/shared` en jest.
- E2E : Maestro (`mobile/.maestro/*.yaml`) sur un build dev client ou preview.
- Job CI `mobile` : `npm ci` à la racine, tests shared, `tsc --noEmit`, lint, jest. Cache npm sur le `package-lock.json` racine ; les jobs backend et frontend ne changent pas.
- Secrets (clé APNs, compte de service FCM, keystore, `google-services.json`) dans les credentials EAS, jamais dans le repo.

## Suivis identifiés (hors lots)

- Universal links / App Links : AASA et `assetlinks.json` servis par nginx sur les sous-domaines wildcard (v1.1).
- Fenêtre de grâce sur la rotation du refresh token pour une app tuée entre la réponse et l'écriture en SecureStore.
- `GET /api/users/:id/devices` pour l'ADMIN (révoquer l'appareil d'un technicien parti).
