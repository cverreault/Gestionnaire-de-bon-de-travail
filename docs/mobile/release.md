# Dispatch2Go mobile — builds et publication (B38.10)

Pré-requis : comptes Apple Developer et Google Play activés (voir [roadmap](roadmap.md), pré-requis), `npm i -g eas-cli`, connexion `eas login` avec le compte Expo de l'organisation.

## 1. Initialiser le projet EAS (une fois)

```bash
cd mobile
eas init
```

`eas init` crée le projet et affiche son `projectId`. Il est lu par `app.config.ts` via `EAS_PROJECT_ID` : le mettre dans l'environnement des builds EAS (`eas env:create --scope project --name EAS_PROJECT_ID --value <id> --visibility plaintext`) et dans le shell de dev pour tester le push sur un appareil physique. Sans lui, l'app fonctionne mais le token push est indisponible (statut sur le profil).

## 2. Profils (`mobile/eas.json`)

| Profil | Usage | Bundle id | Distribution |
|---|---|---|---|
| `development` | dev client pour simulateur iOS / APK Android, `EAS_BUILD_PROFILE=development` → suffixe `.dev` et nom « Dispatch2Go (dev) » | `com.dispatch2go.app.dev` | interne |
| `preview` | build de test réaliste (TestFlight interne / APK) | `com.dispatch2go.app` | interne |
| `production` | store, `autoIncrement` du numéro de build | `com.dispatch2go.app` | store |

```bash
eas build --profile development --platform ios     # simulateur
eas build --profile preview --platform android     # APK à installer à la main
eas build --profile production --platform all
eas submit --profile production --platform ios     # TestFlight puis App Store
eas submit --profile production --platform android # Play, piste interne
```

Renseigner `submit.production.ios.appleTeamId` dans `eas.json` (identifiant d'équipe Apple).

## 3. Credentials

EAS gère les certificats iOS, la clé APNs et le keystore Android (`eas credentials`). Rien n'est commité : `.gitignore` exclut `google-services.json`, `*.keystore`, `*.p8`, `*.mobileprovision`. Le push passe par Expo Push Service (ADR-015) : aucune clé FCM / APNs côté serveur Dispatch2Go.

## 4. Déclarations de store

- **Google Play, localisation en arrière-plan** : formulaire « Autorisation de localisation » + vidéo montrant le consentement dans le profil, l'activation seulement pendant un BT en route / en cours et la désactivation. Texte à reprendre de l'écran de consentement de l'app. Refus possible : l'app retombe sur « pendant l'utilisation » sans autre changement.
- **App Store, confidentialité** : localisation (liée à l'utilisateur, usage « fonctionnalité de l'app »), photos (pièces jointes), identifiant d'appareil (installationId, non publicitaire).

## 5. Porte de version

Le serveur bloque les builds trop anciens : clés `mobile.min-app-version.ios` / `.android` et `mobile.latest-app-version` (écran SA « Configuration plateforme », fallback env `MOBILE_MIN_APP_VERSION_*`). Monter la version minimale seulement après que le build correspondant est disponible sur les deux stores.

## 6. Versionnage

`version` dans `app.config.ts` (semver, `appVersionSource: local`) ; le numéro de build est auto-incrémenté par EAS en production. À chaque changement natif (nouveau module Expo), reconstruire avec EAS ; les changements JS seuls peuvent passer par EAS Update plus tard (canaux déjà nommés dans `eas.json`, non activé en v1).

## 7. Tests de bout en bout (Maestro)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
cd mobile
maestro test .maestro/01-login.yaml -e WORKSPACE=https://www.dispatch2go.com -e EMAIL=... -e PASSWORD=...
maestro test .maestro/02-work-order-offline.yaml
```

Les flows utilisent les libellés FR de l'app ; lancer le simulateur en français. Non exécutés en CI (pas de build EAS en CI en v1).

## 8. Checklist de publication

1. `npm run check` vert à la racine ; CI verte.
2. `eas build --profile preview` sur les deux plateformes ; tester connexion, transitions hors ligne, photo, signature, GPS, push (appareil physique).
3. Notes de version (`frontend/src/pages/ReleaseNotesPage.tsx`) et `version` dans `app.config.ts`.
4. `eas build --profile production --platform all`, puis `eas submit`.
5. Après publication : monter `mobile.latest-app-version`, et `mobile.min-app-version.*` seulement si une rupture d'API l'exige.

## 9. Builds de test hors store (APK) et mise à jour depuis l'app

Un APK local ou `preview` peut être distribué sans Google Play depuis `https://<domaine>/downloads/` (dossier `downloads/` du dépôt, servi par le proxy nginx, binaires non versionnés).

```bash
# Sur le Mac, après ./gradlew assembleRelease (ou téléchargement du build EAS preview)
scp mobile/android/app/build/outputs/apk/release/app-release.apk cverreault@imp:/home/cverreault/projet/taskmgr/downloads/dispatch2go.apk
ssh cverreault@imp '/home/cverreault/projet/taskmgr/scripts/mobile/publish-apk.sh "" "Notes courtes de la version"'
```

`publish-apk.sh` renomme l'APK en `downloads/dispatch2go-<version>.apk`, pointe l'alias `dispatch2go.apk` (lien partagé) sur cette version, supprime les versions précédentes (`KEEP_OLD=1` pour les garder) et écrit `downloads/version.json` (version **lue dans l'APK** par `scripts/mobile/apk-version.py` — un écart avec `mobile/app.config.ts` signale un clone en retard sur le Mac : `git pull` puis rebuild —, fichier, taille, sha256, date, notes ; la page `downloads/` l'affiche). Les apps Android installées hors store le consultent au démarrage, au retour au premier plan (≤ toutes les 6 h) et au retour du réseau ; si la version est plus récente, une bannière « Mise à jour disponible » télécharge l'APK et ouvre l'installateur Android — l'utilisateur confirme d'un tap, Android n'autorise pas l'installation silencieuse. Les builds `production` (`extra.distribution = store`) ignorent ce mécanisme : Google Play met à jour lui-même. iOS : uniquement TestFlight / App Store.

Ne pas oublier de **monter `version` dans `app.config.ts`** avant chaque build de test, sinon les appareils ne verront pas de mise à jour.

## 10. Activer le push sur l'APK hors store (B66)

Le push passe par Expo Push Service ; il faut un projet Expo (identifiant public) et, pour Android, un projet Firebase. Une fois faits, ça marche pour tous les builds (local, preview, production) sans rien côté serveur Dispatch2Go, sauf le réglage `mobile.push.enabled` (super-admin, actif par défaut).

1. **Projet Expo** — sur le Mac : `npm i -g eas-cli`, `eas login` (compte Expo gratuit), puis dans `mobile/` : `eas init`. Copier le `projectId` affiché dans `mobile/eas-project.json` : `{ "projectId": "…" }` (commité : ce n'est pas un secret).
2. **Firebase (Android)** — console.firebase.google.com → nouveau projet → ajouter une app Android avec le package `com.dispatch2go.app` → télécharger `google-services.json` dans `mobile/` (gitignoré). Dans Paramètres du projet → Comptes de service → générer une clé privée (JSON).
3. **Donner la clé FCM à Expo** — `eas credentials -p android` → *Push Notifications: FCM V1 service account key* → *Upload* → choisir le JSON de l'étape 2. C'est ce qui permet à Expo d'atteindre les téléphones Android.
4. **Rebuild** — `npx expo prebuild --platform android --clean && cd android && ./gradlew assembleRelease`, publier avec `publish-apk.sh`. Sur le téléphone, le profil affiche le statut du push ; la table `devices` a alors un `push_token`.
5. **iOS (plus tard)** — compte Apple Developer, `eas credentials -p ios` génère la clé APNs ; build via EAS ou Xcode.

Vérification côté serveur : `POST /dispatcher/technicians/:id/locate` répond `{ sent: true }` et la position arrive en quelques secondes ; `mobile.expo-access-token` (super-admin) n'est nécessaire que si le projet Expo active la *push security*.
