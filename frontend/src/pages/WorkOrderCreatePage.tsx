import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateWorkOrder } from '../hooks/useWorkOrders';
import { useV3Clients, useV3Client, useCreateV3Client } from '../hooks/useClients';
import { useTemplate } from '../hooks/useTemplates';
import TemplateFormRenderer from '../components/TemplateFormRenderer';
import { useTaskTypes } from '../hooks/useSettings';
import { useTechnicians } from '../hooks/useUsers';
import { ClientType, AddressType, Role } from '../types';
import type { Client, ClientAddress } from '../types';
import { useAuthStore } from '../context/auth.store';
import { theme, cardStyles, buttonStyles, formStyles, layoutStyles } from '../theme';
import type { CreateWorkOrderDto } from '../services/work-orders.service';
import api from '../services/api';
import { formatStreet } from '../utils/addressFormat';

// ─── Labels ───────────────────────────────────────────────────────────────────

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  [ClientType.RESIDENTIAL]: 'Résidentiel',
  [ClientType.COMMERCIAL]: 'Commercial',
  [ClientType.INDUSTRIAL]: 'Industriel',
  [ClientType.INSTITUTIONAL]: 'Institutionnel',
};

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  [AddressType.OFFICE]: 'Bureau',
  [AddressType.WAREHOUSE]: 'Entrepôt',
  [AddressType.RESIDENCE]: 'Résidence',
  [AddressType.WORKSITE]: 'Chantier',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: '1 — Très basse',
  2: '2 — Basse',
  3: '3 — Normale',
  4: '4 — Haute',
  5: '5 — Urgente',
};

// ─── Stepper indicator ────────────────────────────────────────────────────────

const STEPS = ['Client', 'Adresse', 'Détails', 'Assignation'];

function StepperIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: theme.radius.full,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: theme.font.weightBold,
                  fontSize: theme.font.sizeSm,
                  background: done
                    ? theme.colors.success
                    : active
                    ? theme.colors.primary
                    : theme.colors.borderLight,
                  color: done || active ? '#fff' : theme.colors.textMuted,
                  border: active ? `2px solid ${theme.colors.primaryHover}` : '2px solid transparent',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                style={{
                  marginTop: '0.3rem',
                  fontSize: theme.font.sizeXs,
                  fontWeight: active ? theme.font.weightSemibold : theme.font.weightNormal,
                  color: active ? theme.colors.primary : done ? theme.colors.success : theme.colors.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  background: done ? theme.colors.success : theme.colors.borderLight,
                  margin: '0 0.5rem',
                  marginBottom: '1.25rem',
                  transition: 'background 0.2s ease',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  ...cardStyles.card,
  padding: '1.75rem',
  marginBottom: '1.5rem',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: theme.font.sizeXs,
  fontWeight: theme.font.weightSemibold,
  color: theme.colors.text,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: theme.font.weightBold,
  color: theme.colors.text,
  marginBottom: '1rem',
  paddingBottom: '0.5rem',
  borderBottom: theme.borders.default,
};

// ─── Step 1: Client ───────────────────────────────────────────────────────────

function Step1Client({
  selectedClient,
  onSelectClient,
}: {
  selectedClient: Client | null;
  onSelectClient: (c: Client) => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New client form state
  const [ncFirstName, setNcFirstName] = useState('');
  const [ncLastName, setNcLastName] = useState('');
  const [ncEmail, setNcEmail] = useState('');
  const [ncPhone, setNcPhone] = useState('');
  const [ncType, setNcType] = useState<ClientType>(ClientType.RESIDENTIAL);

  const { data } = useV3Clients({ search: debouncedSearch, limit: 10 });
  const createClient = useCreateV3Client();

  const results = data?.data ?? [];

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setShowDropdown(search.length >= 2);
    }, 350);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  async function handleCreateNewClient() {
    if (!ncFirstName.trim() || !ncLastName.trim()) return;
    const created = await createClient.mutateAsync({
      firstName: ncFirstName.trim(),
      lastName: ncLastName.trim(),
      email: ncEmail.trim() || undefined,
      phone: ncPhone.trim() || undefined,
      clientType: ncType,
    });
    onSelectClient(created);
    setShowNewForm(false);
  }

  const CLIENT_TYPE_COLORS: Record<ClientType, { bg: string; color: string }> = {
    [ClientType.RESIDENTIAL]: { bg: '#dbeafe', color: '#1e40af' },
    [ClientType.COMMERCIAL]: { bg: '#ede9fe', color: '#6d28d9' },
    [ClientType.INDUSTRIAL]: { bg: '#ffedd5', color: '#c2410c' },
    [ClientType.INSTITUTIONAL]: { bg: '#dcfce7', color: '#15803d' },
  };

  return (
    <div style={cardStyle}>
      <p style={sectionTitleStyle}>Étape 1 — Sélection du client</p>

      {selectedClient ? (
        <div>
          <div
            style={{
              background: theme.colors.primaryLight,
              border: `1px solid ${theme.colors.primary}40`,
              borderRadius: theme.radius.md,
              padding: '1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>👤</span>
              <div>
                <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
                  {selectedClient.firstName} {selectedClient.lastName}
                </p>
                <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>
                  {CLIENT_TYPE_LABELS[selectedClient.clientType]}
                  {selectedClient.email && ` · ${selectedClient.email}`}
                  {selectedClient.phone && ` · ${selectedClient.phone}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectClient(null as unknown as Client)}
              style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
            >
              Changer
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div style={{ ...fieldStyle, marginBottom: '0.75rem', position: 'relative' }}>
            <label style={labelStyle}>Rechercher un client existant (min. 2 caractères)</label>
            <input
              style={{ ...formStyles.input }}
              placeholder="Nom, prénom, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (debouncedSearch.length >= 2) setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: theme.colors.surface,
                  border: theme.borders.default,
                  borderRadius: theme.radius.md,
                  boxShadow: theme.shadows.md,
                  zIndex: 50,
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {results.length === 0 ? (
                  <p style={{ padding: '0.75rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textLight, textAlign: 'center' }}>
                    Aucun client trouvé pour « {debouncedSearch} »
                  </p>
                ) : (
                  results.map((c) => {
                    const cc = CLIENT_TYPE_COLORS[c.clientType];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => { onSelectClient(c); setSearch(''); setShowDropdown(false); }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                          padding: '0.625rem 0.875rem',
                          background: 'none',
                          border: 'none',
                          borderBottom: theme.borders.light,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>
                          <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text, fontWeight: theme.font.weightMedium }}>
                            {c.firstName} {c.lastName}
                          </span>
                          {c.email && (
                            <span style={{ marginLeft: '0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>
                              {c.email}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, padding: '0.15rem 0.5rem', borderRadius: theme.radius.full, background: cc.bg, color: cc.color }}>
                          {CLIENT_TYPE_LABELS[c.clientType]}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* New client */}
          {!showNewForm ? (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              style={{ background: 'none', border: `1px dashed ${theme.colors.focusRing}`, color: theme.colors.primary, padding: '0.5rem 1rem', borderRadius: theme.radius.md, cursor: 'pointer', fontSize: theme.font.sizeSm }}
            >
              + Nouveau client
            </button>
          ) : (
            <div style={{ background: theme.colors.surfaceAlt, border: theme.borders.default, borderRadius: theme.radius.md, padding: '1rem', marginTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: theme.font.weightSemibold, color: theme.colors.text, fontSize: theme.font.sizeSm }}>Nouveau client</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Prénom *</label>
                  <input style={{ ...formStyles.input }} value={ncFirstName} onChange={(e) => setNcFirstName(e.target.value)} placeholder="Prénom" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Nom *</label>
                  <input style={{ ...formStyles.input }} value={ncLastName} onChange={(e) => setNcLastName(e.target.value)} placeholder="Nom" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Type</label>
                  <select style={{ ...formStyles.select }} value={ncType} onChange={(e) => setNcType(e.target.value as ClientType)}>
                    {Object.values(ClientType).map((t) => (
                      <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Email</label>
                  <input style={{ ...formStyles.input }} type="email" value={ncEmail} onChange={(e) => setNcEmail(e.target.value)} placeholder="email@exemple.com" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Téléphone</label>
                  <input style={{ ...formStyles.input }} value={ncPhone} onChange={(e) => setNcPhone(e.target.value)} placeholder="514-000-0000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleCreateNewClient}
                  disabled={!ncFirstName.trim() || !ncLastName.trim() || createClient.isPending}
                  style={{ ...buttonStyles.primary, opacity: (!ncFirstName.trim() || !ncLastName.trim()) ? 0.5 : 1 }}
                >
                  {createClient.isPending ? 'Création...' : 'Créer et sélectionner'}
                </button>
                <button type="button" onClick={() => setShowNewForm(false)} style={{ ...buttonStyles.secondary }}>
                  Annuler
                </button>
              </div>
              {createClient.isError && (
                <p style={{ ...formStyles.fieldError, marginTop: '0.5rem' }}>Erreur lors de la création du client.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Step 2: Address ──────────────────────────────────────────────────────────

function Step2Address({
  client,
  selectedAddressId,
  onSelectAddress,
}: {
  client: Client;
  selectedAddressId: string | null;
  onSelectAddress: (id: string, addr: ClientAddress) => void;
}) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [naStreet, setNaStreet] = useState('');
  const [naCity, setNaCity] = useState('');
  const [naPostal, setNaPostal] = useState('');
  const [naProvince, setNaProvince] = useState('QC');
  const [naType, setNaType] = useState<AddressType>(AddressType.WORKSITE);

  // Fetch the full client detail to get ALL addresses (the search/list endpoint
  // only returns the default address — we need the complete list for the picker).
  const { data: fullClient } = useV3Client(client.id);
  const addresses: ClientAddress[] = fullClient?.addresses ?? client.addresses ?? [];

  // If only one address, auto-select it
  useEffect(() => {
    if (addresses.length === 1 && !selectedAddressId) {
      onSelectAddress(addresses[0].id, addresses[0]);
    }
  }, [addresses.length]);

  function formatAddress(a: ClientAddress) {
    const street = `${formatStreet(a)}${a.apartment ? ` app. ${a.apartment}` : ''}`;
    return `${street}, ${a.city}${a.postalCode ? ` ${a.postalCode}` : ''}${a.province ? `, ${a.province}` : ''}`;
  }

  return (
    <div style={cardStyle}>
      <p style={sectionTitleStyle}>Étape 2 — Adresse d'intervention</p>
      <p style={{ margin: '0 0 1rem', fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
        Client : <strong>{client.firstName} {client.lastName}</strong>
      </p>

      {addresses.length === 0 ? (
        <div style={{ padding: '1rem', background: theme.colors.warningLight, borderRadius: theme.radius.md, border: `1px solid ${theme.colors.warning}40`, marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: '#92400e' }}>
            ⚠️ Ce client n'a aucune adresse enregistrée. Vous pouvez continuer sans adresse ou en ajouter une depuis la page Clients.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            return (
              <label
                key={addr.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.875rem',
                  padding: '0.875rem 1rem',
                  background: isSelected ? theme.colors.primaryLight : theme.colors.surface,
                  border: `2px solid ${isSelected ? theme.colors.primary : theme.colors.border}`,
                  borderRadius: theme.radius.md,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="address"
                  value={addr.id}
                  checked={isSelected}
                  onChange={() => onSelectAddress(addr.id, addr)}
                  style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: theme.font.weightMedium, color: theme.colors.text, fontSize: theme.font.sizeSm }}>
                    {formatAddress(addr)}
                    {addr.isDefault && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, background: theme.colors.primaryLight, color: theme.colors.primary, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full }}>
                        Défaut
                      </span>
                    )}
                  </p>
                  <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
                    {ADDRESS_TYPE_LABELS[addr.addressType] ?? addr.addressType}
                    {addr.label && ` · ${addr.label}`}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Skip option */}
      <button
        type="button"
        onClick={() => onSelectAddress('', null as unknown as ClientAddress)}
        style={{ ...buttonStyles.ghost, ...buttonStyles.sm, color: theme.colors.textMuted }}
      >
        Continuer sans adresse →
      </button>
    </div>
  );
}

// ─── Step 3: Work Order Details ───────────────────────────────────────────────

interface WODetails {
  title: string;
  taskTypeId: string;
  priority: number;
  description: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
}

function Step3Details({
  values,
  onChange,
  templateData,
  onTemplateDataChange,
  userRole,
}: {
  values: WODetails;
  onChange: (v: WODetails) => void;
  templateData: Record<string, unknown>;
  onTemplateDataChange: (v: Record<string, unknown>) => void;
  userRole?: Role;
}) {
  const { t } = useTranslation('workOrders');
  const { data: taskTypes } = useTaskTypes(true);
  const selectedTaskType = (taskTypes ?? []).find((tt) => tt.id === values.taskTypeId);
  const { data: template } = useTemplate(selectedTaskType?.templateId ?? '');

  function set<K extends keyof WODetails>(key: K, val: WODetails[K]) {
    onChange({ ...values, [key]: val });
  }

  return (
    <div style={cardStyle}>
      <p style={sectionTitleStyle}>Étape 3 — Détails du bon de travail</p>

      {/* Title */}
      <div style={{ ...fieldStyle, marginBottom: '1rem' }}>
        <label style={labelStyle}>Titre <span style={{ color: theme.colors.danger }}>*</span></label>
        <input
          style={{ ...formStyles.input }}
          placeholder={t('fields.titlePlaceholder', { defaultValue: 'Ex: Installation fibre optique' })}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Task type */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Type de tâche</label>
          <select
            style={{ ...formStyles.select }}
            value={values.taskTypeId}
            onChange={(e) => set('taskTypeId', e.target.value)}
          >
            <option value="">— Sélectionner —</option>
            {(taskTypes ?? []).map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.icon ? `${tt.icon} ` : ''}{tt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Priorité</label>
          <select
            style={{ ...formStyles.select }}
            value={values.priority}
            onChange={(e) => set('priority', Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div style={{ ...fieldStyle, marginBottom: '1rem' }}>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...formStyles.textarea }}
          placeholder={t('fields.descriptionPlaceholder', { defaultValue: 'Détails du travail à effectuer...' })}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date planifiée</label>
          <input style={{ ...formStyles.input }} type="date" value={values.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Heure début</label>
          <input style={{ ...formStyles.input }} type="time" value={values.scheduledStartTime} onChange={(e) => set('scheduledStartTime', e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Heure fin</label>
          <input style={{ ...formStyles.input }} type="time" value={values.scheduledEndTime} onChange={(e) => set('scheduledEndTime', e.target.value)} />
        </div>
      </div>

      {/* Template fields (rendered when the selected TaskType has a template) */}
      {template && template.sections.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ ...sectionTitleStyle, marginBottom: '0.75rem' }}>
            Formulaire — {template.name}
          </p>
          <TemplateFormRenderer
            template={template}
            values={templateData}
            onChange={onTemplateDataChange}
            userRole={userRole}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Assignment ───────────────────────────────────────────────────────

function Step4Assignment({
  client,
  address,
  details,
  assignedToId,
  dispatchNow,
  onAssignedToId,
  onDispatchNow,
  onSubmit,
  isSubmitting,
  submitError,
}: {
  client: Client;
  address: ClientAddress | null;
  details: WODetails;
  assignedToId: string;
  dispatchNow: boolean;
  onAssignedToId: (id: string) => void;
  onDispatchNow: (v: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: boolean;
}) {
  const { data: technicians } = useTechnicians();

  function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: theme.borders.light }}>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, width: '120px', flexShrink: 0, paddingTop: '0.125rem' }}>{label}</span>
        <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text }}>{value || <em style={{ color: theme.colors.textLight }}>—</em>}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Recap card */}
      <div style={{ ...cardStyle }}>
        <p style={sectionTitleStyle}>Récapitulatif</p>
        <SummaryRow label="Client" value={`${client.firstName} ${client.lastName}`} />
        <SummaryRow
          label="Adresse"
          value={
            address
              ? `${formatStreet(address)}, ${address.city}${address.postalCode ? ` ${address.postalCode}` : ''}`
              : 'Aucune adresse'
          }
        />
        <SummaryRow label="Titre" value={details.title} />
        <SummaryRow
          label="Priorité"
          value={PRIORITY_LABELS[details.priority]}
        />
        {details.scheduledDate && (
          <SummaryRow
            label="Date"
            value={`${details.scheduledDate}${details.scheduledStartTime ? ` à ${details.scheduledStartTime}` : ''}${details.scheduledEndTime ? ` → ${details.scheduledEndTime}` : ''}`}
          />
        )}
        {details.description && (
          <SummaryRow label="Description" value={details.description} />
        )}
      </div>

      {/* Assignment card */}
      <div style={{ ...cardStyle }}>
        <p style={sectionTitleStyle}>Assignation (optionnel)</p>

        <div style={{ ...fieldStyle, marginBottom: '1rem' }}>
          <label style={labelStyle}>Technicien</label>
          <select
            style={{ ...formStyles.select }}
            value={assignedToId}
            onChange={(e) => onAssignedToId(e.target.value)}
          >
            <option value="">— Non assigné —</option>
            {(technicians ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </div>

        {assignedToId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dispatchNow}
              onChange={(e) => onDispatchNow(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary }}
            />
            <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text }}>
              Dispatcher immédiatement
            </span>
          </label>
        )}

        {submitError && (
          <div style={{ background: theme.colors.dangerLight, border: '1px solid #fca5a5', color: theme.colors.danger, padding: '0.75rem 1rem', borderRadius: theme.radius.md, fontSize: theme.font.sizeSm, marginTop: '1rem' }}>
            Une erreur est survenue lors de la création du bon de travail. Veuillez réessayer.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkOrderCreatePage() {
  const { t } = useTranslation('workOrders');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userRole = useAuthStore((s) => s.user?.role);
  const createWorkOrder = useCreateWorkOrder();

  // ── Pre-fill from URL params (used when redirected from the Calendar page) ──
  const prefillDate     = searchParams.get('date') ?? '';
  const prefillStart    = searchParams.get('startTime') ?? '';
  const prefillEnd      = searchParams.get('endTime') ?? '';
  const prefillTechId   = searchParams.get('technicianId') ?? '';

  const [step, setStep] = useState(0);

  // Step 1 state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Step 2 state
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<ClientAddress | null>(null);

  // Step 3 state — pre-filled from URL params when present
  const [woDetails, setWoDetails] = useState<WODetails>({
    title: '',
    taskTypeId: '',
    priority: 3,
    description: '',
    scheduledDate: prefillDate,
    scheduledStartTime: prefillStart,
    scheduledEndTime: prefillEnd,
  });

  // Step 3 template data
  const [templateData, setTemplateData] = useState<Record<string, unknown>>({});

  // Step 4 state — pre-filled technician from URL params
  const [assignedToId, setAssignedToId] = useState(prefillTechId);
  const [dispatchNow, setDispatchNow] = useState(false);

  function canGoNext(): boolean {
    switch (step) {
      case 0: return !!selectedClient;
      case 1: return true; // address is optional
      case 2: return !!woDetails.title.trim();
      case 3: return true;
      default: return false;
    }
  }

  function handleSelectClient(c: Client | null) {
    setSelectedClient(c);
    setSelectedAddressId(null);
    setSelectedAddress(null);
  }

  function handleSelectAddress(id: string, addr: ClientAddress) {
    setSelectedAddressId(id || null);
    setSelectedAddress(addr || null);
  }

  async function handleSubmit() {
    if (!selectedClient) return;

    // Combine the date + time pickers into ISO 8601 datetime strings.
    // The backend expects @IsDateString() — passing just "HH:MM" used to silently
    // fail validation and write NULL to scheduled_start_time / _end_time.
    const datePart = woDetails.scheduledDate; // "yyyy-MM-dd"
    function toIso(time: string): string | undefined {
      if (!datePart || !time) return undefined;
      // Treat the picker value as local wall-clock time; let JS attach the TZ offset.
      const d = new Date(`${datePart}T${time}:00`);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }

    const scheduledDateISO = datePart ? new Date(`${datePart}T00:00:00`).toISOString() : undefined;

    const dto: CreateWorkOrderDto & { clientId?: string; clientAddressId?: string; taskTypeId?: string; dispatchNow?: boolean; templateData?: Record<string, unknown> } = {
      title: woDetails.title,
      type: 'OTHER', // default, taskType covers it
      priority: woDetails.priority,
      description: woDetails.description || undefined,
      clientId: selectedClient.id,
      clientAddressId: selectedAddressId || undefined,
      taskTypeId: woDetails.taskTypeId || undefined,
      assignedToId: assignedToId || undefined,
      scheduledDate: scheduledDateISO,
      scheduledStartTime: toIso(woDetails.scheduledStartTime),
      scheduledEndTime: toIso(woDetails.scheduledEndTime),
      templateData: Object.keys(templateData).length > 0 ? templateData : undefined,
    };

    try {
      const wo = await createWorkOrder.mutateAsync(dto as CreateWorkOrderDto);
      // BUG-006 fix: if "Dispatcher immédiatement" was checked and a technician was selected,
      // call assign-and-dispatch immediately after creation.
      if (dispatchNow && assignedToId) {
        await api.post(`/work-orders/${wo.id}/assign-and-dispatch`, {
          technicianId: assignedToId,
        });
      }
      navigate(`/bons-de-travail/${wo.id}`);
    } catch {
      // error surfaced via createWorkOrder.isError
    }
  }

  // Navigation helpers
  function goNext() {
    if (step < 3 && canGoNext()) setStep((s) => s + 1);
    else if (step === 3) handleSubmit();
  }

  function goPrev() {
    if (step > 0) setStep((s) => s - 1);
  }

  return (
    <div style={{ ...layoutStyles.page, maxWidth: '760px' }}>
      {/* Header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>{t('createTitle')}</h1>
        <Link
          to="/bons-de-travail"
          style={{ color: theme.colors.textSecondary, fontSize: theme.font.sizeSm, textDecoration: 'none' }}
        >
          ← Retour à la liste
        </Link>
      </div>

      {/* Stepper */}
      <StepperIndicator current={step} />

      {/* Step content */}
      {step === 0 && (
        <Step1Client selectedClient={selectedClient} onSelectClient={handleSelectClient} />
      )}
      {step === 1 && selectedClient && (
        <Step2Address
          client={selectedClient}
          selectedAddressId={selectedAddressId}
          onSelectAddress={handleSelectAddress}
        />
      )}
      {step === 2 && (
        <Step3Details values={woDetails} onChange={setWoDetails} templateData={templateData} onTemplateDataChange={setTemplateData} userRole={userRole} />
      )}
      {step === 3 && selectedClient && (
        <Step4Assignment
          client={selectedClient}
          address={selectedAddress}
          details={woDetails}
          assignedToId={assignedToId}
          dispatchNow={dispatchNow}
          onAssignedToId={setAssignedToId}
          onDispatchNow={setDispatchNow}
          onSubmit={handleSubmit}
          isSubmitting={createWorkOrder.isPending}
          submitError={createWorkOrder.isError}
        />
      )}

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={goPrev}
          disabled={step === 0}
          style={{
            ...buttonStyles.secondary,
            opacity: step === 0 ? 0 : 1,
            pointerEvents: step === 0 ? 'none' : 'auto',
          }}
        >
          ← Précédent
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext() || createWorkOrder.isPending}
          style={{
            ...buttonStyles.primary,
            padding: '0.625rem 1.5rem',
            opacity: (!canGoNext() || createWorkOrder.isPending) ? 0.6 : 1,
            cursor: (!canGoNext() || createWorkOrder.isPending) ? 'not-allowed' : 'pointer',
          }}
        >
          {step < 3
            ? 'Suivant →'
            : createWorkOrder.isPending
            ? 'Création en cours...'
            : '✓ Créer le bon de travail'}
        </button>
      </div>
    </div>
  );
}
