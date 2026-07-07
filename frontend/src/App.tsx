import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from './context/auth.store';
import { useUiStore, resolveTheme } from './context/ui.store';
import { useUserPreferences, useUpdateUserPreferences } from './hooks/useUserPreferences';
import { useGpsTracker } from './hooks/useGpsTracker';
import { Role } from './types';

// ── Guards ────────────────────────────────────────────────────────────────────
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';           // ADMIN + DISPATCHER
import AdminOnlyRoute from './components/AdminOnlyRoute';  // ADMIN only (SA inherits)
import SuperAdminRoute from './components/SuperAdminRoute'; // SUPER_ADMIN only
import ClientRoute from './components/ClientRoute';         // CLIENT portal only (B21)
import PortalLayout from './components/layouts/PortalLayout';
import AppLayout from './components/layouts/AppLayout';

// ── Pages ─────────────────────────────────────────────────────────────────────
import LoginPage from './pages/LoginPage';
import PortalActivationPage from './pages/PortalActivationPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import InventoryPage from './pages/InventoryPage';
import MyStockPage from './pages/MyStockPage';
import PortalWorkOrdersPage from './pages/PortalWorkOrdersPage';
import PortalWorkOrderDetailPage from './pages/PortalWorkOrderDetailPage';
import PortalRequestPage from './pages/PortalRequestPage';
import SignupPage from './pages/SignupPage';
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
import SuperAdminPage from './pages/SuperAdminPage';
import SuperAdminTenantsPage from './pages/SuperAdminTenantsPage';
import SuperAdminCreateTenantPage from './pages/SuperAdminCreateTenantPage';
import SuperAdminStatsPage from './pages/SuperAdminStatsPage';
import SuperAdminAuditPage from './pages/SuperAdminAuditPage';
import SuperAdminUsersPage from './pages/SuperAdminUsersPage';
import SuperAdminAllUsersPage from './pages/SuperAdminAllUsersPage';
import SuperAdminPlatformUsersPage from './pages/SuperAdminPlatformUsersPage';
import SuperAdminPlansPage from './pages/SuperAdminPlansPage';
import MySubscriptionPage from './pages/MySubscriptionPage';
import ApiKeysPage from './pages/ApiKeysPage';
import ApiDocsPage from './pages/ApiDocsPage';
import WebhooksPage from './pages/WebhooksPage';
import AlertsPage from './pages/AlertsPage';
import RecurringPage from './pages/RecurringPage';
import DispatchMapPage from './pages/DispatchMapPage';
import NotFoundPage from './pages/NotFoundPage';
import ReleaseNotesPage from './pages/ReleaseNotesPage';
import ReportsPage from './pages/ReportsPage';
import api from './services/api';

export default function App() {
  const { user } = useAuthStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const impersonationActive = useAuthStore((s) => s.impersonation.active);
  const themeMode = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);
  const { i18n } = useTranslation();

  // ── Refresh the persisted user object from the server on mount ──
  // The Zustand persist middleware caches the user shape across reloads,
  // including the role. If the server-side role changes (SA promoted /
  // demoted in DB) the persisted state would otherwise lag and the SA
  // routes / sidebar would render the wrong layout. /auth/me is cheap.
  // We also use this round-trip to detect dangling impersonation : if
  // the server returns a user whose tenantId doesn't match the
  // impersonated tenant slug, we know the impersonation session has
  // already been ended elsewhere → force a clean restore.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        const refreshed = (data?.data ?? data) as typeof user;
        if (cancelled || !refreshed) return;
        updateUser(refreshed);
        // Defensive : if persisted impersonation references a different
        // tenant than the one the JWT actually puts us in, restore the
        // SA session so the user is never stuck in a hybrid state.
        if (
          impersonationActive &&
          refreshed?.role !== 'ADMIN' &&
          refreshed?.role !== 'DISPATCHER' &&
          refreshed?.role !== 'TECHNICIAN'
        ) {
          stopImpersonation();
        }
      } catch {
        // Swallow — interceptor handles 401, anything else can wait.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per mount + once when isAuthenticated flips true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
  // GPS tracker is a no-op unless the user is a TECHNICIAN AND
  // preferences.gps.enabled is true — both checks live inside the hook.
  useGpsTracker();
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

  // Roles that access the admin/dispatcher UI. SUPER_ADMIN is NOT here —
  // the platform admin has its own portal under /super-admin and never
  // touches a tenant's UI directly (impersonation is the path in).
  const isAdminOrDispatcher =
    user?.role === Role.ADMIN || user?.role === Role.DISPATCHER;
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const isClient = user?.role === Role.CLIENT;

  return (
    <Routes>
      {/* ── Public ────────────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/portail/activation" element={<PortalActivationPage />} />
      <Route path="/confidentialite" element={<PrivacyPolicyPage />} />

      {/* ── Protected ─────────────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>

          {/* Root redirect based on role */}
          <Route
            path="/"
            element={
              isSuperAdmin
                ? <Navigate to="/super-admin/stats" replace />
                : isAdminOrDispatcher
                ? <Navigate to="/dashboard" replace />
                : isClient
                ? <Navigate to="/portail" replace />
                : <Navigate to="/mes-bons" replace />
            }
          />

          {/* ── Profile & Release Notes — accessible to ALL authenticated roles ── */}
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/release-notes" element={<ReleaseNotesPage />} />
          <Route path="/documentation-api" element={<ApiDocsPage />} />

          {/* ── Technician (mobile-first) ────────────────────────────── */}
          <Route path="/mes-bons" element={<TechnicianWorkOrdersPage />} />
          <Route path="/mes-bons/:id" element={<TechnicianWorkOrderDetailPage />} />
          <Route path="/mon-stock" element={<MyStockPage />} />

          {/* ── Admin + Dispatcher ────────────────────────────────────── */}
          <Route element={<AdminRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bons-de-travail" element={<WorkOrdersPage />} />
            <Route path="/bons-de-travail/nouveau" element={<WorkOrderCreatePage />} />
            <Route path="/bons-de-travail/:id" element={<WorkOrderDetailPage />} />
            <Route path="/calendrier" element={<CalendarPage />} />
            <Route path="/carte-dispatch" element={<DispatchMapPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/inventaire" element={<InventoryPage />} />
            <Route path="/adresses" element={<AddressesPage />} />
            <Route path="/rapports" element={<ReportsPage />} />
          </Route>

          {/* ── Admin only (SA inherits) ──────────────────────────────── */}
          <Route element={<AdminOnlyRoute />}>
            <Route path="/utilisateurs" element={<UsersPage />} />
            <Route path="/parametres" element={<SettingsPage />} />
            <Route path="/parametres/processus" element={<ProcessSettingsPage />} />
            <Route path="/parametres/templates" element={<TemplatesSettingsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/mon-abonnement" element={<MySubscriptionPage />} />
            <Route path="/parametres/api-keys" element={<ApiKeysPage />} />
            <Route path="/parametres/webhooks" element={<WebhooksPage />} />
            <Route path="/parametres/alertes" element={<AlertsPage />} />
            <Route path="/parametres/bons-recurrents" element={<RecurringPage />} />
          </Route>

          {/* ── Super-admin only ──────────────────────────────────────── */}
          <Route element={<SuperAdminRoute />}>
            <Route path="/super-admin" element={<SuperAdminPage />} />
            <Route path="/super-admin/tenants" element={<SuperAdminTenantsPage />} />
            <Route path="/super-admin/tenants/nouveau" element={<SuperAdminCreateTenantPage />} />
            <Route path="/super-admin/stats" element={<SuperAdminStatsPage />} />
            <Route path="/super-admin/audit" element={<SuperAdminAuditPage />} />
            <Route path="/super-admin/users" element={<SuperAdminUsersPage />} />
            <Route path="/super-admin/all-users" element={<SuperAdminAllUsersPage />} />
            <Route path="/super-admin/platform-users" element={<SuperAdminPlatformUsersPage />} />
            <Route path="/super-admin/plans" element={<SuperAdminPlansPage />} />
            <Route path="/super-admin/sauvegarde" element={<BackupPage />} />
          </Route>

        </Route>

        {/* ── Client portal (B21) — own layout, never AppLayout ─────────── */}
        <Route element={<ClientRoute />}>
          <Route element={<PortalLayout />}>
            <Route path="/portail" element={<PortalWorkOrdersPage />} />
            <Route path="/portail/bons/:id" element={<PortalWorkOrderDetailPage />} />
            <Route path="/portail/demande" element={<PortalRequestPage />} />
          </Route>
        </Route>
      </Route>

      {/* ── 404 ───────────────────────────────────────────────────────── */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
