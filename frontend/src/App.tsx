import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './context/auth.store';
import { useUiStore, resolveTheme } from './context/ui.store';
import { useUserPreferences, useUpdateUserPreferences } from './hooks/useUserPreferences';
import { Role } from './types';

// ── Guards ────────────────────────────────────────────────────────────────────
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';           // ADMIN + DISPATCHER
import AdminOnlyRoute from './components/AdminOnlyRoute';  // ADMIN only
import AppLayout from './components/layouts/AppLayout';

// ── Pages ─────────────────────────────────────────────────────────────────────
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderCreatePage from './pages/WorkOrderCreatePage';
import CalendarPage from './pages/CalendarPage';
import TechnicianWorkOrdersPage from './pages/TechnicianWorkOrdersPage';
import TechnicianWorkOrderDetailPage from './pages/TechnicianWorkOrderDetailPage';
import UsersPage from './pages/UsersPage';
import ClientsPage from './pages/ClientsPage';
import AddressesPage from './pages/AddressesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import ProcessSettingsPage from './pages/ProcessSettingsPage';
import TemplatesSettingsPage from './pages/TemplatesSettingsPage';
import BackupPage from './pages/BackupPage';
import AuditPage from './pages/AuditPage';
import NotFoundPage from './pages/NotFoundPage';
import ReleaseNotesPage from './pages/ReleaseNotesPage';

export default function App() {
  const { user } = useAuthStore();
  const themeMode = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);
  const { i18n } = useTranslation();

  // Sync i18next language with our UI store + reflect on <html lang>.
  useEffect(() => {
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
    document.documentElement.lang = locale;
  }, [locale, i18n]);

  // ── Sync between local UI store and server-side User.preferences ──
  // 1) On login (when prefs arrive), hydrate the store from server values.
  // 2) On user toggle (store changes), push the patch to the server.
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferences();
  const hydratedRef = useRef(false);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLocale = useUiStore((s) => s.setLocale);

  useEffect(() => {
    if (!user) {
      hydratedRef.current = false;
      return;
    }
    if (!prefs || hydratedRef.current) return;
    // Apply server values once on first load — don't overwrite a deliberate
    // local change made before /me/preferences returned.
    if (prefs.theme && prefs.theme !== themeMode) setTheme(prefs.theme);
    if (prefs.locale && prefs.locale !== locale) setLocale(prefs.locale);
    hydratedRef.current = true;
  }, [user, prefs, themeMode, locale, setTheme, setLocale]);

  useEffect(() => {
    if (!user || !hydratedRef.current) return;
    // Push outgoing changes — only when the value differs from server state.
    const patch: { theme?: typeof themeMode; locale?: typeof locale } = {};
    if (prefs?.theme !== themeMode) patch.theme = themeMode;
    if (prefs?.locale !== locale) patch.locale = locale;
    if (Object.keys(patch).length > 0) {
      updatePrefs.mutate(patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode, locale, user]);

  // Apply the resolved theme (light/dark) to <html> + meta tag.
  // Re-runs whenever the user toggles the picker; the 'system' option also
  // listens to OS color-scheme changes via `matchMedia`.
  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(themeMode);
      document.documentElement.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#1e40af');
    };
    apply();
    if (themeMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);

  // Roles that access the admin/dispatcher UI
  const isAdminOrDispatcher =
    user?.role === Role.ADMIN || user?.role === Role.DISPATCHER;

  return (
    <Routes>
      {/* ── Public ────────────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />

      {/* ── Protected ─────────────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>

          {/* Root redirect based on role */}
          <Route
            path="/"
            element={
              isAdminOrDispatcher
                ? <Navigate to="/dashboard" replace />
                : <Navigate to="/mes-bons" replace />
            }
          />

          {/* ── Profile & Release Notes — accessible to ALL authenticated roles ── */}
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/release-notes" element={<ReleaseNotesPage />} />

          {/* ── Technician (mobile-first) ────────────────────────────── */}
          <Route path="/mes-bons" element={<TechnicianWorkOrdersPage />} />
          <Route path="/mes-bons/:id" element={<TechnicianWorkOrderDetailPage />} />

          {/* ── Admin + Dispatcher ────────────────────────────────────── */}
          <Route element={<AdminRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bons-de-travail" element={<WorkOrdersPage />} />
            <Route path="/bons-de-travail/nouveau" element={<WorkOrderCreatePage />} />
            <Route path="/bons-de-travail/:id" element={<WorkOrderDetailPage />} />
            <Route path="/calendrier" element={<CalendarPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/adresses" element={<AddressesPage />} />
          </Route>

          {/* ── Admin only ────────────────────────────────────────────── */}
          <Route element={<AdminOnlyRoute />}>
            <Route path="/utilisateurs" element={<UsersPage />} />
            <Route path="/parametres" element={<SettingsPage />} />
            <Route path="/parametres/processus" element={<ProcessSettingsPage />} />
            <Route path="/parametres/templates" element={<TemplatesSettingsPage />} />
            <Route path="/sauvegarde" element={<BackupPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>

        </Route>
      </Route>

      {/* ── 404 ───────────────────────────────────────────────────────── */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
