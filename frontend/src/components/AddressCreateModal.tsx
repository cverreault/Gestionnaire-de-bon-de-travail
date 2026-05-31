import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  useSearchUnifiedClients,
  useCreateV3Client,
  useAddClientAddress,
  useCreateStandaloneAddress,
  useUpdateAddressById,
  useDeleteAddressById,
} from '../hooks/useClients';
import { useAddressTypes } from '../hooks/useSettings';
import { ClientType, type ClientAddressWithClient } from '../types';
import type { UnifiedClient } from '../services/clients.service';
import AddressFormFields, {
  ADDRESS_FORM_DEFAULTS,
  type AddressFormValues,
} from './AddressFormFields';
import AddressTypeCustomFields from './AddressTypeCustomFields';
import { theme, buttonStyles, formStyles, modalStyles } from '../theme';

interface NewClientForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  clientType: ClientType;
}

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  /** When set, the modal switches to edit mode for this address. */
  address?: ClientAddressWithClient | null;
}

/**
 * Modal de création d'adresse depuis la page /adresses.
 * Permet de rattacher l'adresse à un client existant (recherche) ou à un
 * nouveau client créé inline.
 */
export default function AddressCreateModal({ onClose, onCreated, address }: Props) {
  const isEdit = !!address;
  const { t } = useTranslation('addresses');
  const { t: tCommon } = useTranslation('common');
  const { t: tClients } = useTranslation('clients');

  // ── Client picker state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<UnifiedClient | null>(
    address?.client
      ? {
          id: address.client.id,
          firstName: address.client.firstName,
          lastName: address.client.lastName,
          email: address.client.email ?? null,
          phone: null,
          source: 'local',
        }
      : null,
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setShowDropdown(search.length >= 2);
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const { data: results = [] } = useSearchUnifiedClients(debouncedSearch);

  // ── Inline new-client form state ──
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientForm>({
    firstName: '', lastName: '', email: '', phone: '', clientType: ClientType.RESIDENTIAL,
  });

  // Whether to skip the client link entirely (orphan/standalone address).
  const [noClient, setNoClient] = useState<boolean>(isEdit && !address?.client);

  // ── Address form ──
  const addressForm = useForm<AddressFormValues>({
    defaultValues: address
      ? {
          streetNumber: address.streetNumber ?? '',
          street: address.street,
          apartment: address.apartment ?? '',
          city: address.city,
          postalCode: address.postalCode ?? '',
          province: address.province ?? '',
          country: address.country ?? '',
          addressType: address.addressType ?? '',
          label: address.label ?? '',
          isDefault: address.isDefault ?? false,
        }
      : ADDRESS_FORM_DEFAULTS,
  });

  // Custom fields per AddressType — render dynamic inputs based on the selected type
  const { data: addressTypes = [] } = useAddressTypes(true);
  const watchedType = addressForm.watch('addressType');
  // Map our AddressType enum value (e.g. WORKSITE) to its AddressTypeConfig (by code)
  const matchingConfig = addressTypes.find((c) => c.code === watchedType);
  const customFields = matchingConfig?.fields ?? [];
  const [typeData, setTypeData] = useState<Record<string, unknown>>(
    (address?.typeData as Record<string, unknown> | undefined) ?? {},
  );

  // Reset typeData when the type *changes* (after the initial render) so
  // values from a different type don't leak in. In edit mode we preserve
  // the existing values for the address's current type.
  const prevType = useRef(watchedType);
  useEffect(() => {
    if (prevType.current !== watchedType) {
      setTypeData({});
      prevType.current = watchedType;
    }
  }, [watchedType]);

  // ── Mutations ──
  const createClient = useCreateV3Client();
  const addAddress = useAddClientAddress();
  const createStandalone = useCreateStandaloneAddress();
  const updateAddress = useUpdateAddressById();
  const deleteAddress = useDeleteAddressById();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit() {
    setError(null);
    const ok = await addressForm.trigger();
    if (!ok) return;

    const a = addressForm.getValues();
    const addressDto = {
      streetNumber: a.streetNumber || undefined,
      street: a.street,
      apartment: a.apartment || undefined,
      city: a.city,
      postalCode: a.postalCode || undefined,
      province: a.province || undefined,
      country: a.country || undefined,
      addressType: a.addressType,
      label: a.label || undefined,
      isDefault: a.isDefault,
      typeData: Object.keys(typeData).length > 0 ? typeData : undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && address) {
        // ── Edit mode: PATCH the existing address by id.
        // Resolve the new clientId:
        //   noClient → null (detach)
        //   selectedClient.local → that id
        //   showNewClient → create the client first, then link
        let nextClientId: string | null | undefined;
        if (noClient) {
          nextClientId = null;
        } else if (showNewClient) {
          if (!newClient.firstName.trim() || !newClient.lastName.trim()) {
            setError('Prénom et nom du nouveau client sont requis.');
            return;
          }
          const created = await createClient.mutateAsync({
            firstName: newClient.firstName.trim(),
            lastName: newClient.lastName.trim(),
            email: newClient.email.trim() || undefined,
            phone: newClient.phone.trim() || undefined,
            clientType: newClient.clientType,
          });
          nextClientId = created.id;
        } else if (selectedClient && selectedClient.source === 'local') {
          nextClientId = selectedClient.id;
        } else {
          setError(t('messages.selectClient'));
          return;
        }

        await updateAddress.mutateAsync({
          addressId: address.id,
          data: {
            ...addressDto,
            // Only send clientId when it actually changes vs. the loaded address.
            ...(nextClientId !== (address.clientId ?? null) && {
              clientId: nextClientId,
            }),
          },
        });
      } else if (noClient) {
        await createStandalone.mutateAsync(addressDto);
      } else if (showNewClient) {
        if (!newClient.firstName.trim() || !newClient.lastName.trim()) {
          setError('Prénom et nom du nouveau client sont requis.');
          return;
        }
        // Atomic: create client + address in one POST
        await createClient.mutateAsync({
          firstName: newClient.firstName.trim(),
          lastName: newClient.lastName.trim(),
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
          clientType: newClient.clientType,
          addresses: [addressDto],
        });
      } else if (selectedClient && selectedClient.source === 'local') {
        await addAddress.mutateAsync({ clientId: selectedClient.id, data: addressDto });
      } else {
        setError(t('messages.selectClient'));
        return;
      }
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? 'Erreur lors de l\'enregistrement.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !address) return;
    setError(null);
    setSubmitting(true);
    try {
      await deleteAddress.mutateAsync(address.id);
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? 'Erreur lors de la suppression.');
      setConfirmDelete(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '620px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>
            {isEdit ? `✏️ ${t('edit')}` : `📍 ${t('create').replace(/^\+\s*/, '')}`}
          </h2>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <div style={{ ...modalStyles.body }}>
          {/* ── Client picker ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.5rem' }}>
            <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('associatedClient', { defaultValue: 'Client associé' })}
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={noClient}
                onChange={(e) => {
                  setNoClient(e.target.checked);
                  if (e.target.checked) {
                    setSelectedClient(null);
                    setShowNewClient(false);
                    setSearch('');
                  }
                }}
              />
              {t('fields.noClientOption')}
            </label>
          </div>
          {noClient ? (
            <div style={{
              background: theme.colors.surfaceAlt,
              border: `1px dashed ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
              fontSize: theme.font.sizeSm,
              color: theme.colors.textMuted,
            }}>
              {t('fields.noClientHint')}
            </div>
          ) : selectedClient ? (
            <div style={{ background: theme.colors.primaryLight, border: `1px solid ${theme.colors.primary}40`, borderRadius: theme.radius.md, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>{selectedClient.firstName} {selectedClient.lastName}</strong>
                {selectedClient.email && <span style={{ marginLeft: '0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>{selectedClient.email}</span>}
              </div>
              <button onClick={() => { setSelectedClient(null); setSearch(''); }} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>Changer</button>
            </div>
          ) : !showNewClient ? (
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <input
                style={{ ...formStyles.input, boxSizing: 'border-box' }}
                placeholder={t('searchClientPlaceholder', { defaultValue: 'Rechercher un client par nom, email…' })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => debouncedSearch.length >= 2 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              />
              {showDropdown && debouncedSearch.length >= 2 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.25rem', background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.md, boxShadow: theme.shadows.md, zIndex: 50, maxHeight: '200px', overflowY: 'auto' }}>
                  {results.length === 0 ? (
                    <p style={{ padding: '0.625rem 0.875rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textLight, textAlign: 'center' }}>
                      {t('noClientFound', { query: debouncedSearch, defaultValue: 'Aucun client trouvé pour « {{query}} »' })}
                    </p>
                  ) : (
                    results.map((c) => (
                      <button
                        key={`${c.source}-${c.id}`}
                        type="button"
                        onMouseDown={() => {
                          setSelectedClient(c);
                          setSearch(`${c.firstName} ${c.lastName}`);
                          setShowDropdown(false);
                        }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', background: 'none', border: 'none', borderBottom: theme.borders.light, cursor: 'pointer', fontSize: theme.font.sizeSm, color: theme.colors.text }}
                      >
                        {c.firstName} {c.lastName}
                        {c.email && <span style={{ marginLeft: '0.5rem', color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}>{c.email}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                style={{ marginTop: '0.5rem', background: 'none', border: `1px dashed ${theme.colors.focusRing}`, color: theme.colors.primary, padding: '0.375rem 0.75rem', borderRadius: theme.radius.md, cursor: 'pointer', fontSize: theme.font.sizeXs }}
              >
                {t('messages.createNewClient')}
              </button>
            </div>
          ) : (
            <div style={{ background: theme.colors.surfaceAlt, border: theme.borders.default, borderRadius: theme.radius.md, padding: '0.75rem', marginBottom: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeXs, color: theme.colors.text }}>{tClients('create').replace(/^\+\s*/, '')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input value={newClient.firstName} onChange={(e) => setNewClient((p) => ({ ...p, firstName: e.target.value }))} placeholder={`${tClients('fields.firstName')} *`} style={{ ...formStyles.input, boxSizing: 'border-box' }} />
                <input value={newClient.lastName} onChange={(e) => setNewClient((p) => ({ ...p, lastName: e.target.value }))} placeholder={`${tClients('fields.lastName')} *`} style={{ ...formStyles.input, boxSizing: 'border-box' }} />
                <input value={newClient.email} onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} placeholder={tClients('fields.email')} style={{ ...formStyles.input, boxSizing: 'border-box' }} />
                <input value={newClient.phone} onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} placeholder={tClients('fields.phone')} style={{ ...formStyles.input, boxSizing: 'border-box' }} />
                <select value={newClient.clientType} onChange={(e) => setNewClient((p) => ({ ...p, clientType: e.target.value as ClientType }))} style={{ ...formStyles.select, boxSizing: 'border-box', gridColumn: '1 / -1' }}>
                  <option value={ClientType.RESIDENTIAL}>Résidentiel</option>
                  <option value={ClientType.COMMERCIAL}>Commercial</option>
                  <option value={ClientType.INDUSTRIAL}>Industriel</option>
                  <option value={ClientType.INSTITUTIONAL}>Institutionnel</option>
                </select>
              </div>
              <button type="button" onClick={() => { setShowNewClient(false); setNewClient({ firstName: '', lastName: '', email: '', phone: '', clientType: ClientType.RESIDENTIAL }); }} style={{ ...buttonStyles.ghost, ...buttonStyles.sm }}>
                {t('messages.selectExisting')}
              </button>
            </div>
          )}

          {/* ── Address form ── */}
          <p style={{ margin: '0.75rem 0 0.5rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('titleSingular')}
          </p>
          <AddressFormFields form={addressForm} />

          {customFields.length > 0 && (
            <AddressTypeCustomFields
              fields={customFields}
              values={typeData}
              onChange={setTypeData}
            />
          )}

          {error && (
            <p style={{ ...formStyles.fieldError, marginTop: '0.5rem' }}>{error}</p>
          )}
        </div>

        <div style={{ ...modalStyles.footer, justifyContent: 'space-between' }}>
          <div>
            {isEdit && (
              confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger }}>{tCommon('actions.confirm')} ?</span>
                  <button type="button" onClick={handleDelete} disabled={submitting} style={{ ...buttonStyles.danger, ...buttonStyles.sm }}>
                    {tCommon('actions.yes')}, {tCommon('actions.delete').toLowerCase()}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={submitting} style={{ ...buttonStyles.ghost, ...buttonStyles.sm }}>
                    {tCommon('actions.no')}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={submitting} style={{ ...buttonStyles.ghost, color: theme.colors.danger }}>
                  🗑 {tCommon('actions.delete')}
                </button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} style={{ ...buttonStyles.secondary }}>{tCommon('actions.cancel')}</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (!noClient && !selectedClient && !showNewClient)}
              style={{ ...buttonStyles.primary, opacity: (submitting || (!noClient && !selectedClient && !showNewClient)) ? 0.7 : 1, cursor: (submitting || (!noClient && !selectedClient && !showNewClient)) ? 'not-allowed' : 'pointer' }}
            >
              {submitting
                ? (isEdit ? tCommon('actions.saving') : tCommon('actions.creating', { defaultValue: 'Création...' }))
                : (isEdit ? `✓ ${tCommon('actions.save')}` : `✓ ${t('create').replace(/^\+\s*/, '')}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
