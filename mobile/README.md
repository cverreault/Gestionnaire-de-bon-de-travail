# Dispatch2Go — app mobile technicien

React Native + Expo SDK 57 (dev client, expo-router). Décisions : [ADR-014](../docs/adrs/ADR-014-native-mobile-app-platform.md) à [ADR-017](../docs/adrs/ADR-017-mobile-background-gps.md). Feuille de route : [docs/mobile/roadmap.md](../docs/mobile/roadmap.md).

## Démarrer sur un Mac

Pré-requis : Node 20, Watchman, Xcode (simulateur iOS), Android Studio (émulateur), CocoaPods.

```bash
# À la racine du dépôt, une seule fois (workspaces npm : mobile + packages/*)
npm ci

# Vérifications rapides
npm run check            # typecheck + lint + tests de shared et mobile

# Lancer l'app
cd mobile
npx expo run:ios         # compile le dev client et ouvre le simulateur iOS
npx expo run:android     # idem sur l'émulateur ou un Android branché en USB
npx expo start           # ensuite : serveur Metro seul, l'app déjà installée s'y connecte
```

Le backend reste distant : l'app demande l'URL du workspace au premier lancement (ADR-014 §3). Aucune variable d'environnement n'est requise pour le développement.

### iOS 27 / Xcode 27 : cycle de vie UIScene

Le SDK iOS 27 fait planter au lancement (`EXC_BREAKPOINT` dans `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) toute app qui n'adopte pas le cycle de vie par scène. Le template Expo 57 ne le fait pas encore ; le config plugin [`plugins/with-ios-scene-lifecycle.js`](plugins/with-ios-scene-lifecycle.js) s'en charge à chaque `expo prebuild` : manifeste de scène dans `Info.plist`, `SceneDelegate.swift` (sous-classe de `ExpoAppSceneDelegate`) ajouté à la cible, `AppDelegate` transformé en `ExpoReactNativeFactoryProvider`. À retirer quand le template Expo l'intégrera nativement. Si `ios/` existe déjà, régénérer avec `npx expo prebuild --platform ios --clean`.

## Structure

```
mobile/
├── app.config.ts     # identité (Dispatch2Go, com.dispatch2go.app, dispatch2go://), plugins
├── eas.json          # profils de build development / preview / production (docs/mobile/release.md)
├── .maestro/         # flows de bout en bout (connexion, note hors ligne)
├── plugins/          # config plugins maison (cycle de vie UIScene pour iOS 27)
├── metro.config.js   # résolution monorepo (packages/shared) + .sql (migrations drizzle)
├── drizzle/          # migrations SQLite générées (npm run db:generate après src/db/schema.ts)
├── jest.config.js    # jest-expo, transforme @taskmgr/shared
└── src/
    ├── app/          # routes expo-router
    ├── db/           # schéma drizzle, client expo-sqlite, requêtes locales
    ├── sync/         # tirage delta (apply-pull), file hors ligne (queue, project, drain, senders), store et hooks — testés sur better-sqlite3
    ├── components/
    ├── hooks/
    └── constants/
```

`packages/shared` (`@taskmgr/shared`) est importé en source : types, contrats, utilitaires purs, locales. Aucun code React ni DOM n'y entre.

## Builds EAS

Les profils `development`, `preview` et `production` seront ajoutés en B38.10. Les credentials (APNs, FCM, keystore) vivent dans EAS, jamais dans le dépôt.

## Base locale (B38.4)

Les BT du technicien vivent dans SQLite (`dispatch2go.db`, expo-sqlite + drizzle). Le tirage delta `GET /api/me/sync` s'exécute à l'ouverture de session, au retour au premier plan, au retour du réseau et en tirant la liste. Après avoir modifié `src/db/schema.ts`, lancer `npm run db:generate` et committer `drizzle/`. Le moteur (`src/sync/apply-pull.ts`) est testé sans natif sur better-sqlite3 avec les mêmes migrations.

## File hors ligne (B38.5)

Chaque geste du technicien (transition, note, photo) est écrit dans `sync_queue` puis envoyé par le drain séquentiel (`src/sync/drain.ts`) avec `Idempotency-Key = id de l'opération` et `expectedUpdatedAt` propagé. Sur 409 de verrou optimiste, l'app tire d'abord, rejoue les opérations additives (3 essais) et met les transitions en conflit ; l'onglet Sync permet d'appliquer quand même ou d'abandonner (ADR-016 §4). Les photos sont copiées dans `documentDirectory/queue/` en attendant l'envoi. Les pièces (`part_add`, `part_remove`) passent aussi par la file : recherche dans le catalogue local ou scan (`BarcodeScanner`, expo-camera). Les signatures (client, technicien) sont capturées par `SignaturePad` (react-native-signature-canvas sur WebView) en PNG data-URL et passent par la même file.

## GPS en arrière-plan (B38.8)

`src/gps/` : la tâche `dispatch2go-background-location` (expo-task-manager) ne fait qu'écrire les positions dans `location_fixes` ; le contrôleur au premier plan décide du mode avec `decideTracking` (consentement serveur `preferences.gps.enabled`, permission OS, au moins un BT en route ou en cours — ADR-017 §3) et envoie les lots à `POST /api/me/locations/batch`. Un 403 (consentement retiré depuis le web) arrête la collecte et l'affiche dans le profil. Sur le simulateur iOS, simuler un trajet via Features › Location.

## Notifications push (B38.9)

`src/push/` : permission et canal Android au démarrage de session, token Expo obtenu avec le `projectId` EAS (`EAS_PROJECT_ID` dans l'environnement de build ; absent en dev client → statut « indisponible » sur le profil, rien ne casse) et transmis au serveur par l'enregistrement de l'appareil. Réception → tirage delta ; toucher → ouverture du BT (`data.workOrderId` ou `data.url`). Le serveur relaie via Expo Push Service (B37.4).
