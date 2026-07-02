import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, buttonStyles, formStyles } from '../theme';
import { Role, ClientType } from '../types';
import { useAuthStore } from '../context/auth.store';
import { toast } from '../context/toast.store';
import { getTaskTypes, createTaskType } from '../services/settings.service';
import { getClients, createClient } from '../services/clients.service';

/**
 * OnboardingWizard (B7.10).
 *
 * Shown once when a tenant's ADMIN lands on the dashboard and the tenant
 * has ZERO task types AND ZERO clients — i.e. it has never been used.
 * Guides them through the 3 first-time steps :
 *   1. Welcome
 *   2. Create their first task type (prefix + name)
 *   3. Create their first client (individual, minimal fields)
 *   → done : redirect to create BT.
 *
 * State is derived from server data (task types + clients count). The
 * wizard also honors a localStorage skip flag ("taskmgr:onboarding-dismissed")
 * so the SA impersonating an existing tenant can dismiss without breaking
 * anything. That flag is per-browser-per-tenant so the natural admin sees
 * the wizard from a fresh browser.
 */
export default function OnboardingWizard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation('onboarding');

  const enabled = user?.role === Role.ADMIN;

  // Tenant emptiness signals — both are cheap enough to poll on mount.
  const taskTypesQ = useQuery({
    queryKey: ['task-types', 'onboarding-detect'],
    queryFn: () => getTaskTypes().then((r) => r.data.data ?? r.data),
    enabled,
    retry: false,
  });
  const clientsQ = useQuery({
    queryKey: ['clients', 'onboarding-detect'],
    queryFn: () => getClients({ limit: 1 }).then((r) => r.data.data ?? r.data),
    enabled,
    retry: false,
  });

  const isEmpty = useMemo(() => {
    if (!enabled) return false;
    if (taskTypesQ.isLoading || clientsQ.isLoading) return false;
    const noTaskTypes = !taskTypesQ.data || (taskTypesQ.data as unknown[]).length === 0;
    // getClients response shape is { data: Client[], pagination }.
    // We stashed data.data ?? data above, so clientsQ.data may be either.
    const clientsData = (clientsQ.data as { data?: unknown[] } | unknown[]) ?? [];
    const list = Array.isArray(clientsData) ? clientsData : clientsData.data ?? [];
    const noClients = list.length === 0;
    return noTaskTypes && noClients;
  }, [enabled, taskTypesQ.data, taskTypesQ.isLoading, clientsQ.data, clientsQ.isLoading]);

  const storageKey = user ? `taskmgr:onboarding-dismissed:${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (storageKey && localStorage.getItem(storageKey) === 'true') {
      setDismissed(true);
    }
  }, [storageKey]);

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [taskType, setTaskType] = useState({ name: 'Réparation', prefix: 'REP' });
  const [client, setClient] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    clientType: ClientType.RESIDENTIAL,
  });

  const createTt = useMutation({
    mutationFn: () =>
      createTaskType({
        name: taskType.name.trim(),
        prefix: taskType.prefix.trim().toUpperCase(),
      } as Parameters<typeof createTaskType>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-types'] });
      setStep(2);
    },
    onError: (err) => toast.error(errorMessage(err) ?? t('taskType.errorGeneric')),
  });

  const createCli = useMutation({
    mutationFn: () =>
      createClient({
        firstName: client.firstName.trim(),
        lastName: client.lastName.trim(),
        companyName: client.companyName.trim() || undefined,
        clientType: client.clientType,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setStep(3);
    },
    onError: (err) => toast.error(errorMessage(err) ?? t('client.errorGeneric')),
  });

  if (!enabled || !isEmpty || dismissed) return null;

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  const jumpToBt = () => {
    dismiss();
    navigate('/bons-de-travail/nouveau');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          ...cardStyles.card,
          width: '100%',
          maxWidth: 560,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', gap: 4, padding: 4, background: theme.colors.surfaceAlt }}>
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                background: s <= step ? theme.colors.primary : theme.colors.border,
                borderRadius: 2,
                transition: 'background 0.2s ease',
              }}
            />
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {step === 0 && (
            <Welcome
              tenantName={user?.firstName ? `${user.firstName}` : ''}
              onStart={() => setStep(1)}
              onDismiss={dismiss}
            />
          )}
          {step === 1 && (
            <TaskTypeStep
              value={taskType}
              onChange={setTaskType}
              onNext={() => createTt.mutate()}
              onSkip={() => setStep(2)}
              isSubmitting={createTt.isPending}
            />
          )}
          {step === 2 && (
            <ClientStep
              value={client}
              onChange={setClient}
              onNext={() => createCli.mutate()}
              onSkip={() => setStep(3)}
              isSubmitting={createCli.isPending}
            />
          )}
          {step === 3 && <DoneStep onJumpToBt={jumpToBt} onDismiss={dismiss} />}
        </div>
      </div>
    </div>
  );
}

function Welcome({
  tenantName,
  onStart,
  onDismiss,
}: {
  tenantName: string;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>👋</div>
      <h2 style={{ margin: 0, fontSize: 22 }}>
        {t('welcome.title', { name: tenantName ? `, ${tenantName}` : '' })}
      </h2>
      <p style={{ color: theme.colors.textMuted, fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
        {t('welcome.body')}
        <br />
        {t('welcome.steps')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
        <button onClick={onDismiss} style={buttonStyles.secondary}>
          {t('welcome.later')}
        </button>
        <button onClick={onStart} style={buttonStyles.primary}>
          {t('welcome.start')}
        </button>
      </div>
    </div>
  );
}

function TaskTypeStep({
  value,
  onChange,
  onNext,
  onSkip,
  isSubmitting,
}: {
  value: { name: string; prefix: string };
  onChange: (v: { name: string; prefix: string }) => void;
  onNext: () => void;
  onSkip: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation('onboarding');
  const canSubmit = value.name.trim().length > 0 && /^[A-Za-z0-9]+$/.test(value.prefix.trim());
  return (
    <div>
      <StepHeader n={1} title={t('taskType.title')} />
      <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 0 }}>
        {t('taskType.subtitle')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('taskType.name')}</span>
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            style={formStyles.input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('taskType.prefix')}</span>
          <input
            value={value.prefix}
            onChange={(e) => onChange({ ...value, prefix: e.target.value.toUpperCase() })}
            maxLength={10}
            style={formStyles.input}
          />
        </label>
      </div>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
        {t('taskType.prefixHint')}
      </div>
      <StepFooter
        onSkip={onSkip}
        onNext={onNext}
        canNext={canSubmit && !isSubmitting}
        nextLabel={isSubmitting ? t('submitting') : t('next')}
      />
    </div>
  );
}

function ClientStep({
  value,
  onChange,
  onNext,
  onSkip,
  isSubmitting,
}: {
  value: { firstName: string; lastName: string; companyName: string; clientType: ClientType };
  onChange: (v: {
    firstName: string;
    lastName: string;
    companyName: string;
    clientType: ClientType;
  }) => void;
  onNext: () => void;
  onSkip: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation('onboarding');
  const canSubmit = value.firstName.trim().length > 0 && value.lastName.trim().length > 0;
  return (
    <div>
      <StepHeader n={2} title={t('client.title')} />
      <p style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 0 }}>
        {t('client.subtitle')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('client.firstName')}</span>
          <input
            value={value.firstName}
            onChange={(e) => onChange({ ...value, firstName: e.target.value })}
            style={formStyles.input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('client.lastName')}</span>
          <input
            value={value.lastName}
            onChange={(e) => onChange({ ...value, lastName: e.target.value })}
            style={formStyles.input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('client.company')}</span>
          <input
            value={value.companyName}
            onChange={(e) => onChange({ ...value, companyName: e.target.value })}
            style={formStyles.input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>{t('client.type')}</span>
          <select
            value={value.clientType}
            onChange={(e) => onChange({ ...value, clientType: e.target.value as ClientType })}
            style={formStyles.input}
          >
            <option value={ClientType.RESIDENTIAL}>{t('client.types.RESIDENTIAL')}</option>
            <option value={ClientType.COMMERCIAL}>{t('client.types.COMMERCIAL')}</option>
            <option value={ClientType.INDUSTRIAL}>{t('client.types.INDUSTRIAL')}</option>
            <option value={ClientType.INSTITUTIONAL}>{t('client.types.INSTITUTIONAL')}</option>
          </select>
        </label>
      </div>
      <StepFooter
        onSkip={onSkip}
        onNext={onNext}
        canNext={canSubmit && !isSubmitting}
        nextLabel={isSubmitting ? t('submitting') : t('next')}
      />
    </div>
  );
}

function DoneStep({
  onJumpToBt,
  onDismiss,
}: {
  onJumpToBt: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
      <h2 style={{ margin: 0, fontSize: 22 }}>{t('done.title')}</h2>
      <p style={{ color: theme.colors.textMuted, fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
        {t('done.subtitle')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
        <button onClick={onDismiss} style={buttonStyles.secondary}>
          {t('done.back')}
        </button>
        <button onClick={onJumpToBt} style={buttonStyles.primary}>
          {t('done.createBt')}
        </button>
      </div>
    </div>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  const { t } = useTranslation('onboarding');
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 700 }}>
        {t('step', { current: n, total: 3 })}
      </div>
      <h3 style={{ margin: '4px 0 0', fontSize: 18 }}>{title}</h3>
    </div>
  );
}

function StepFooter({
  onSkip,
  onNext,
  canNext,
  nextLabel,
}: {
  onSkip: () => void;
  onNext: () => void;
  canNext: boolean;
  nextLabel: string;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
      <button onClick={onSkip} style={buttonStyles.secondary}>
        {t('skip')}
      </button>
      <button
        onClick={onNext}
        disabled={!canNext}
        style={{
          ...buttonStyles.primary,
          opacity: canNext ? 1 : 0.5,
          cursor: canNext ? 'pointer' : 'not-allowed',
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

const labelText: React.CSSProperties = {
  fontSize: 11,
  color: theme.colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

function errorMessage(err: unknown): string | null {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (!msg) return null;
  return Array.isArray(msg) ? msg.join(', ') : msg;
}
