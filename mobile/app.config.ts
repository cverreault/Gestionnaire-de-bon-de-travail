import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Identité de l'app (ADR-014 §1) : Dispatch2Go, bundle id com.dispatch2go.app,
 * schéma dispatch2go://. Le profil EAS « development » suffixe le bundle id et
 * le nom pour cohabiter avec la version store sur le même appareil.
 */
const IS_DEV = process.env.EAS_BUILD_PROFILE === 'development';

const VERSION = '0.10.3';

/**
 * versionCode Android strictement croissant, dérivé de la version (0.7.0 → 700).
 * Sans lui, Expo met 1 à chaque build : Android accepte alors de « mettre à jour »
 * vers un APK identique ou plus ancien sans rien dire.
 */
const ANDROID_VERSION_CODE = VERSION.split('.').reduce((acc, part) => acc * 100 + Number(part), 0);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Dispatch2Go (dev)' : 'Dispatch2Go',
  slug: 'dispatch2go',
  version: VERSION,
  orientation: 'portrait',
  scheme: 'dispatch2go',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IS_DEV ? 'com.dispatch2go.app.dev' : 'com.dispatch2go.app',
    supportsTablet: false,
    icon: './assets/expo.icon',
    // ADR-017 : background location only while a work order is active (see src/gps).
    infoPlist: { UIBackgroundModes: ['location'] },
  },
  android: {
    package: IS_DEV ? 'com.dispatch2go.app.dev' : 'com.dispatch2go.app',
    versionCode: ANDROID_VERSION_CODE,
    // Mise à jour d'un APK hors store depuis l'app (src/update) ; sans effet sur un build Play.
    permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    './plugins/with-ios-scene-lifecycle',
    './plugins/with-android-abis',
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ['expo-notifications', { color: '#208AEF', defaultChannel: 'default' }],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: "Dispatch2Go partage votre position avec la répartition pendant qu'un bon de travail est en route ou en cours, si vous l'avez activé dans votre profil.",
        locationWhenInUsePermission: "Dispatch2Go partage votre position avec la répartition pendant qu'un bon de travail est actif, si vous l'avez activé dans votre profil.",
        isIOSBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-camera',
      { cameraPermission: 'Dispatch2Go utilise l\'appareil photo pour scanner les codes-barres des pièces.' },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: "Dispatch2Go utilise l'appareil photo pour joindre des photos aux bons de travail.",
        photosPermission: 'Dispatch2Go accède à vos photos pour les joindre aux bons de travail.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    // Renseigné par `eas init` ; pas un secret.
    eas: { projectId: process.env.EAS_PROJECT_ID },
    // 'store' désactive l'auto-mise à jour APK (Google Play s'en charge) ; sinon l'app
    // surveille <workspace>/downloads/version.json (builds locaux et preview).
    distribution: process.env.EAS_BUILD_PROFILE === 'production' ? 'store' : 'sideload',
  },
});
