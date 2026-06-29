import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// ── FR ─────────────────────────────────────────────────────────────────────
import frCommon from './locales/fr/common.json';
import frNav from './locales/fr/nav.json';
import frAuth from './locales/fr/auth.json';
import frWorkOrders from './locales/fr/workOrders.json';
import frClients from './locales/fr/clients.json';
import frAddresses from './locales/fr/addresses.json';
import frSettings from './locales/fr/settings.json';
import frErrors from './locales/fr/errors.json';
import frReports from './locales/fr/reports.json';

// ── EN ─────────────────────────────────────────────────────────────────────
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enAuth from './locales/en/auth.json';
import enWorkOrders from './locales/en/workOrders.json';
import enClients from './locales/en/clients.json';
import enAddresses from './locales/en/addresses.json';
import enSettings from './locales/en/settings.json';
import enErrors from './locales/en/errors.json';
import enReports from './locales/en/reports.json';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        common: frCommon,
        nav: frNav,
        auth: frAuth,
        workOrders: frWorkOrders,
        clients: frClients,
        addresses: frAddresses,
        settings: frSettings,
        errors: frErrors,
        reports: frReports,
      },
      en: {
        common: enCommon,
        nav: enNav,
        auth: enAuth,
        workOrders: enWorkOrders,
        clients: enClients,
        addresses: enAddresses,
        settings: enSettings,
        errors: enErrors,
        reports: enReports,
      },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS: 'common',
    ns: ['common', 'nav', 'auth', 'workOrders', 'clients', 'addresses', 'settings', 'errors', 'reports'],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // Order matters: localStorage (ui.store) > navigator. User.preferences
      // is applied later by App.tsx via i18n.changeLanguage().
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'taskmgr-locale',
      caches: ['localStorage'],
    },
  });

export default i18n;
