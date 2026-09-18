import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Identité de l'app (ADR-014 §1) : Dispatch2Go, bundle id com.dispatch2go.app,
 * schéma dispatch2go://. Le profil EAS « development » suffixe le bundle id et
 * le nom pour cohabiter avec la version store sur le même appareil.
 */
const IS_DEV = process.env.EAS_BUILD_PROFILE === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Dispatch2Go (dev)' : 'Dispatch2Go',
  slug: 'dispatch2go',
  version: '0.1.0',
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
    'expo-router',
    'expo-secure-store',
    'expo-localization',
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
  },
});
