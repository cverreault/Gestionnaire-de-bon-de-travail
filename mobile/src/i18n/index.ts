import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import fr from '@taskmgr/shared/locales/fr/mobile.json';
import en from '@taskmgr/shared/locales/en/mobile.json';

/**
 * i18n (ADR-005 on mobile). Device language first; overridden by the user's
 * `preferences.locale` once logged in (see session bootstrap in _layout).
 * Resources live in packages/shared/locales so web and mobile share strings.
 */
const deviceLang = getLocales()[0]?.languageCode ?? 'fr';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { fr: { mobile: fr }, en: { mobile: en } },
    lng: deviceLang.startsWith('en') ? 'en' : 'fr',
    fallbackLng: 'fr',
    defaultNS: 'mobile',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
