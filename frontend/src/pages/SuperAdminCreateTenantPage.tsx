import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  createTenant,
  getPlanCatalog,
  uploadTenantLogo,
  type CreateTenantInput,
  type TenantPlan,
} from '../services/super-admin.service';
import { useQuery } from '@tanstack/react-query';

const PLANS: TenantPlan[] = ['FREE', 'PRO', 'ENTERPRISE'];

/** Base domain for the subdomain preview — configurable per deployment. */
const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'taskmgr.local';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/;

/**
 * SA create-tenant page (B7.5).
 *
 * One step provisions the whole workspace: tenant identity + subdomain
 * (= slug) + optional plan/quota overrides + optional logo + the first
 * ADMIN account. The backend wraps tenant + admin + catalog seed in a
 * single transaction; the logo (if any) is uploaded right after.
 */
export default function SuperAdminCreateTenantPage() {
  const { t } = useTranslation('superAdmin');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<TenantPlan>('FREE');
  const [quotas, setQuotas] = useState<{
    maxUsers?: number;
    maxWorkOrdersPerMonth?: number;
    maxStorageMb?: number;
    maxClients?: number;
  }>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [admin, setAdmin] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });

  const logoPreview = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );

  const slugValid = SLUG_RE.test(slug);
  const canSubmit =
    slugValid &&
    name.trim().length >= 2 &&
    admin.firstName.trim() &&
    admin.lastName.trim() &&
    /^\S+@\S+\.\S+$/.test(admin.email) &&
    admin.password.length >= 8;

  const create = useMutation({
    mutationFn: async () => {
      const input: CreateTenantInput = {
        slug,
        name: name.trim(),
        plan,
        ...quotas,
        admin: {
          email: admin.email.trim(),
          password: admin.password,
          firstName: admin.firstName.trim(),
          lastName: admin.lastName.trim(),
        },
      };
      const res = await createTenant(input);
      if (logoFile) {
        // Best-effort — the tenant already exists; a logo failure must not
        // make the whole creation look like it failed.
        await uploadTenantLogo(res.tenant.id, logoFile).catch(() => undefined);
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'tenants'] });
      navigate('/super-admin/tenants');
    },
  });

  // The backend's validation error response has three possible shapes :
  //   1. `message: string`                    — simple errors
  //   2. `message: string[]`                  — legacy class-validator
  //   3. `message: ValidationError[]`         — nestjs-i18n with `detailedErrors: true`
  // Shape 3 carries objects like `{ property, constraints, children }` —
  // rendering them raw crashes React ("Objects are not valid as a React
  // child"), so we flatten to `"property: constraint message"` strings.
  const rawMessage = (
    create.error as { response?: { data?: { message?: unknown } } } | undefined
  )?.response?.data?.message;
  const errorMessages: string[] = flattenValidationMessage(rawMessage);
  const errorText = errorMessages.join(', ');

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>➕ {t('superAdmin:createTenant.title', { defaultValue: 'Créer un tenant' })}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('superAdmin:createTenant.subtitle', { defaultValue: 'Provisionne un espace de travail complet : sous-domaine, plan, logo et premier administrateur.' })}
        </p>
      </header>

      <div style={{ ...cardStyles.card, padding: 24, maxWidth: 640 }}>
        {/* ── Workspace ─────────────────────────────────────────── */}
        <SectionTitle>{t('superAdmin:createTenant.workspaceSection', { defaultValue: 'Espace de travail' })}</SectionTitle>
        <Stack>
          <Field label={t('superAdmin:createTenant.orgName', { defaultValue: "Nom de l'organisation" })}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              style={formStyles.input}
            />
          </Field>

          <Field label={t('superAdmin:createTenant.subdomain', { defaultValue: 'Sous-domaine (slug)' })}>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
              placeholder="acme"
              style={{
                ...formStyles.input,
                borderColor:
                  slug && !slugValid ? theme.colors.danger : theme.colors.border,
              }}
            />
            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
              {t('superAdmin:createTenant.addressLabel', { defaultValue: 'Adresse :' })}{' '}
              <code style={{ color: theme.colors.primary }}>
                {slug || t('superAdmin:createTenant.slugPlaceholder', { defaultValue: 'votre-slug' })}.{BASE_DOMAIN}
              </code>
            </span>
            {slug && !slugValid && (
              <span style={{ fontSize: 12, color: theme.colors.danger }}>
                {t('superAdmin:createTenant.slugRule', { defaultValue: '3–20 caractères, minuscules/chiffres/tirets, début et fin alphanumériques.' })}
              </span>
            )}
          </Field>

          <Field label={t('superAdmin:createTenant.plan', { defaultValue: 'Plan' })}>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as TenantPlan)}
              style={formStyles.input}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <PlanPreview plan={plan} />
          </Field>
        </Stack>

        {/* ── Quotas (optional) ─────────────────────────────────── */}
        <SectionTitle>{t('superAdmin:createTenant.quotasSection', { defaultValue: 'Quotas (optionnel — sinon valeurs du plan)' })}</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <NumField
            label={t('superAdmin:createTenant.maxUsers', { defaultValue: 'Max users' })}
            value={quotas.maxUsers}
            onChange={(v) => setQuotas({ ...quotas, maxUsers: v })}
          />
          <NumField
            label={t('superAdmin:createTenant.maxWorkOrders', { defaultValue: 'Max BTs/mois' })}
            value={quotas.maxWorkOrdersPerMonth}
            onChange={(v) => setQuotas({ ...quotas, maxWorkOrdersPerMonth: v })}
          />
          <NumField
            label={t('superAdmin:createTenant.maxStorage', { defaultValue: 'Max stockage (MB)' })}
            value={quotas.maxStorageMb}
            onChange={(v) => setQuotas({ ...quotas, maxStorageMb: v })}
          />
          <NumField
            label={t('superAdmin:createTenant.maxClients', { defaultValue: 'Max clients' })}
            value={quotas.maxClients}
            onChange={(v) => setQuotas({ ...quotas, maxClients: v })}
          />
        </div>

        {/* ── Logo (optional) ───────────────────────────────────── */}
        <SectionTitle>{t('superAdmin:createTenant.logoSection', { defaultValue: 'Logo (optionnel — PNG/JPEG/WEBP/SVG, ≤ 2 Mo)' })}</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logoPreview && (
            <img
              src={logoPreview}
              alt={t('superAdmin:createTenant.logoPreviewAlt', { defaultValue: 'Aperçu du logo' })}
              style={{
                width: 56,
                height: 56,
                objectFit: 'contain',
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.surfaceAlt,
              }}
            />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
        </div>

        {/* ── First admin ───────────────────────────────────────── */}
        <SectionTitle>{t('superAdmin:createTenant.firstAdminSection', { defaultValue: 'Premier administrateur' })}</SectionTitle>
        <Stack>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('superAdmin:createTenant.firstName', { defaultValue: 'Prénom' })}>
              <input
                value={admin.firstName}
                onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })}
                style={formStyles.input}
              />
            </Field>
            <Field label={t('superAdmin:createTenant.lastName', { defaultValue: 'Nom' })}>
              <input
                value={admin.lastName}
                onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })}
                style={formStyles.input}
              />
            </Field>
          </div>
          <Field label={t('superAdmin:createTenant.email', { defaultValue: 'Email' })}>
            <input
              type="email"
              value={admin.email}
              onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
              placeholder="admin@acme.com"
              style={formStyles.input}
            />
          </Field>
          <Field label={t('superAdmin:createTenant.password', { defaultValue: 'Mot de passe (≥ 8 caractères)' })}>
            <input
              type="password"
              value={admin.password}
              onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
              placeholder="••••••••"
              style={formStyles.input}
            />
          </Field>
        </Stack>

        {errorMessages.length > 0 && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 6,
              background: theme.colors.dangerLight,
              border: `1px solid ${theme.colors.danger}`,
              color: theme.colors.danger,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>{t('superAdmin:createTenant.createFailure', { defaultValue: 'Échec de la création :' })}</strong>
            {errorMessages.length > 1 ? (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {errorMessages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <span> {errorMessages[0]}</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={() => navigate('/super-admin/tenants')} style={buttonStyles.secondary}>
            {t('superAdmin:createTenant.cancel', { defaultValue: 'Annuler' })}
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: !canSubmit || create.isPending ? 0.6 : 1,
              cursor: !canSubmit || create.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {create.isPending ? t('superAdmin:createTenant.creating', { defaultValue: 'Création…' }) : t('superAdmin:createTenant.createButton', { defaultValue: 'Créer le tenant' })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: '24px 0 12px',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.colors.textMuted,
        borderBottom: `1px solid ${theme.colors.border}`,
        paddingBottom: 6,
      }}
    >
      {children}
    </h3>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function PlanPreview({ plan }: { plan: TenantPlan }) {
  const { t } = useTranslation('superAdmin');
  const { data } = useQuery({
    queryKey: ['superAdmin', 'plans'],
    queryFn: getPlanCatalog,
    staleTime: 5 * 60_000,
  });
  const def = data?.find((p) => p.code === plan);
  if (!def) return null;
  const hasBase = def.priceMonthly > 0;
  const hasPerUser = def.pricePerUserMonthly > 0;
  const isFree = !hasBase && !hasPerUser;
  const storageLabel =
    def.quotas.maxStorageMb >= 1000
      ? `${(def.quotas.maxStorageMb / 1000).toFixed(0)} Go`
      : `${def.quotas.maxStorageMb} Mo`;
  return (
    <div
      style={{
        marginTop: 4,
        padding: '10px 12px',
        borderRadius: 6,
        background: theme.colors.surfaceAlt,
        border: `1px solid ${theme.colors.border}`,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.text }}>
          {def.displayName}
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
          {t('superAdmin:createTenant.planQuotas', {
            defaultValue: '👥 {{users}} users · 📋 {{workOrders}} BTs/mois · 🧑‍🤝‍🧑 {{clients}} clients · 💾 {{storage}}',
            users: def.quotas.maxUsers,
            workOrders: def.quotas.maxWorkOrdersPerMonth.toLocaleString('fr-CA'),
            clients: def.quotas.maxClients.toLocaleString('fr-CA'),
            storage: storageLabel,
          })}
        </div>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: theme.colors.primary,
          whiteSpace: 'nowrap',
          textAlign: 'right',
          lineHeight: 1.3,
        }}
      >
        {isFree && <span>{t('superAdmin:createTenant.free', { defaultValue: 'Gratuit' })}</span>}
        {hasBase && (
          <div>
            {def.priceMonthly} {def.currency}
            <span style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}{t('superAdmin:createTenant.perMonth', { defaultValue: '/ mois' })}
            </span>
          </div>
        )}
        {hasPerUser && (
          <div>
            {hasBase && <span style={{ color: theme.colors.textMuted, fontWeight: 500 }}>+ </span>}
            {def.pricePerUserMonthly} {def.currency}
            <span style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}{t('superAdmin:createTenant.perUserPerMonth', { defaultValue: '/ user / mois' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={1}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? undefined : Number.parseInt(v, 10) || undefined);
        }}
        style={formStyles.input}
      />
    </Field>
  );
}


// ─── Validation error flattening ───────────────────────────────────

interface ValidationErrorNode {
  property?: string;
  constraints?: Record<string, string>;
  children?: ValidationErrorNode[];
}

/**
 * Recursively walks a `ValidationError[]` tree returned by nestjs-i18n
 * (detailedErrors: true) and produces `"property: message"` strings, one
 * per failed constraint. Accepts any of the three shapes the backend may
 * emit so shape drift never crashes React.
 */
function flattenValidationMessage(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") return [raw];
  if (!Array.isArray(raw)) return [String(raw)];
  const out: string[] = [];
  const walk = (nodes: unknown[], path: string) => {
    for (const n of nodes) {
      if (typeof n === "string") {
        out.push(n);
        continue;
      }
      if (n == null || typeof n !== "object") continue;
      const node = n as ValidationErrorNode;
      const nextPath = path
        ? node.property
          ? `${path}.${node.property}`
          : path
        : node.property ?? "";
      if (node.constraints) {
        for (const msg of Object.values(node.constraints)) {
          out.push(nextPath ? `${nextPath}: ${msg}` : msg);
        }
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children, nextPath);
      }
    }
  };
  walk(raw, "");
  return out;
}
