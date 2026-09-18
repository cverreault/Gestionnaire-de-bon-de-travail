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
├── plugins/          # config plugins maison (cycle de vie UIScene pour iOS 27)
├── metro.config.js   # résolution monorepo (packages/shared)
├── jest.config.js    # jest-expo, transforme @taskmgr/shared
└── src/
    ├── app/          # routes expo-router
    ├── components/
    ├── hooks/
    └── constants/
```

`packages/shared` (`@taskmgr/shared`) est importé en source : types, contrats, utilitaires purs, locales. Aucun code React ni DOM n'y entre.

## Builds EAS

Les profils `development`, `preview` et `production` seront ajoutés en B38.10. Les credentials (APNs, FCM, keystore) vivent dans EAS, jamais dans le dépôt.
