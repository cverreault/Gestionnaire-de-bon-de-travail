import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  useV3Clients,
  useV3Client,
  useCreateV3Client,
  useUpdateV3Client,
  useDeleteV3Client,
  useAddClientAddress,
  useUpdateClientAddress,
  useDeleteClientAddress,
} from '../hooks/useClients';
import type { Client, ClientAddress } from '../types';
import { ClientType, AddressType } from '../types';
import { clientTypeLabel, addressTypeLabel } from '../utils/entityLabels';
import type { CreateV3ClientDto, CreateClientAddressDto } from '../services/clients.service';
import LoadingSpinner from '../components/LoadingSpinner';
import CsvImportExportPanel from '../components/CsvImportExportPanel';
import {
  downloadClientTemplate,
  exportClientsCsv,
  importClientsCsv,
} from '../services/clients-csv.service';
import {
  theme,
  tableStyles,
  buttonStyles,
  formStyles,
  modalStyles,
  layoutStyles,
  getRowStyle,
} from '../theme';

// ─── Client type badge colors ─────────────────────────────────────────────────

const CLIENT_TYPE_COLORS: Record<ClientType, { bg: string; color: string }> = {
  [ClientType.RESIDENTIAL]: { bg: '#dbeafe', color: '#1e40af' },
  [ClientType.COMMERCIAL]: { bg: '#ede9fe', color: '#6d28d9' },
  [ClientType.INDUSTRIAL]: { bg: '#ffedd5', color: '#c2410c' },
  [ClientType.INSTITUTIONAL]: { bg: '#dcfce7', color: '#15803d' },
};

// ─── Form types ───────────────────────────────────────────────────────────────

interface ClientFormValues {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  clientType: ClientType;
  notes: string;
}

import AddressFormFields, { ADDRESS_FORM_DEFAULTS } from '../components/AddressFormFields';
import type { AddressFormValues } from '../components/AddressFormFields';
import AddressTypeCustomFields from '../components/AddressTypeCustomFields';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invitePortalClient } from '../services/portal.service';
import api from '../services/api';
import { toast } from '../context/toast.store';
import { useAddressTypes } from '../hooks/useSettings';
import { formatStreet } from '../utils/addressFormat';

// ─── Client Type Badge ────────────────────────────────────────────────────────

function ClientTypeBadge({ type }: { type: ClientType }) {
  const { t } = useTranslation('clients');
  const colors = CLIENT_TYPE_COLORS[type];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.15rem 0.6rem',
        borderRadius: theme.radius.full,
        fontSize: theme.font.sizeXs,
        fontWeight: theme.font.weightSemibold,
        background: colors.bg,
        color: colors.color,
        whiteSpace: 'nowrap',
      }}
    >
      {clientTypeLabel(t, type)}
    </span>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function ClientModal({
  title,
  defaultValues,
  clientId,
  onSubmit,
  onCancel,
  isLoading,
  isError,
}: {
  title: string;
  defaultValues?: Partial<ClientFormValues>;
  clientId?: string;
  /** When invoked at creation time (no clientId), `addresses` carries the
   *  inline-filled addresses to send in the same POST as the client. Ignored
   *  on edit (in which case addresses are managed individually via the address
   *  list inside the modal). */
  onSubmit: (
    values: ClientFormValues,
    addresses?: AddressFormValues[],
    addressTypeData?: Record<string, unknown>,
  ) => void | Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation('clients');
  const { t: tCommon } = useTranslation('common');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const addAddress = useAddClientAddress();
  const updateAddress = useUpdateClientAddress();
  const deleteAddress = useDeleteClientAddress();
  const { data: clientDetail } = useV3Client(clientId ?? '');
  const existingAddresses: ClientAddress[] | undefined = clientDetail?.addresses;

  const { register, handleSubmit, formState: { errors } } = useForm<ClientFormValues>({
    defaultValues: {
      firstName: defaultValues?.firstName ?? '',
      lastName: defaultValues?.lastName ?? '',
      companyName: defaultValues?.companyName ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      clientType: defaultValues?.clientType ?? ClientType.RESIDENTIAL,
      notes: defaultValues?.notes ?? '',
    },
  });

  const addressForm = useForm<AddressFormValues>({
    defaultValues: {
      addressType: AddressType.WORKSITE,
      country: 'Canada',
      province: 'QC',
      isDefault: false,
    },
  });

  // typeData stores values for the AddressTypeConfig.fields, keyed by fieldId.
  // Reset whenever the type changes so values from a different type don't leak.
  const [typeData, setTypeData] = useState<Record<string, unknown>>({});
  const { data: addressTypeConfigs = [] } = useAddressTypes(true);
  const watchedAddressType = addressForm.watch('addressType');
  const matchingConfig = addressTypeConfigs.find((c) => c.code === watchedAddressType);
  const customFields = matchingConfig?.fields ?? [];
  const prevAddressType = useRef(watchedAddressType);
  useEffect(() => {
    if (prevAddressType.current !== watchedAddressType) {
      setTypeData({});
      prevAddressType.current = watchedAddressType;
    }
  }, [watchedAddressType]);

  async function handleMainSubmit(values: ClientFormValues) {
    // ── 1. Validate the address form (only if it's open) ──
    if (showAddressForm) {
      const ok = await addressForm.trigger();
      if (!ok) return;
    }

    // ── 2a. CREATE mode: bundle the inline address into the parent's create call ──
    if (!clientId) {
      const addresses = showAddressForm ? [addressForm.getValues()] : undefined;
      const td = showAddressForm && Object.keys(typeData).length > 0 ? typeData : undefined;
      await Promise.resolve(onSubmit(values, addresses, td));
      return;
    }

    // ── 2b. EDIT mode: persist the address change BEFORE the client update so the
    //    parent's modal-close side-effect doesn't unmount us mid-flight. ──
    if (showAddressForm) {
      const v = addressForm.getValues();
      const payload = {
        streetNumber: v.streetNumber || undefined,
        street: v.street,
        apartment: v.apartment || undefined,
        city: v.city,
        postalCode: v.postalCode || undefined,
        province: v.province || undefined,
        country: v.country || undefined,
        addressType: v.addressType,
        label: v.label || undefined,
        isDefault: v.isDefault,
        typeData: Object.keys(typeData).length > 0 ? typeData : undefined,
      };
      if (editingAddressId) {
        await updateAddress.mutateAsync({ clientId, addressId: editingAddressId, data: payload });
      } else {
        await addAddress.mutateAsync({ clientId, data: payload });
      }
      addressForm.reset();
      setEditingAddressId(null);
      setShowAddressForm(false);
      setTypeData({});
    }

    // ── 3. Save client info via parent's onSubmit handler (parent will close the modal). ──
    await Promise.resolve(onSubmit(values));
  }

  function openEditAddress(addr: ClientAddress) {
    addressForm.reset({
      streetNumber: addr.streetNumber ?? '',
      street: addr.street,
      apartment: addr.apartment ?? '',
      city: addr.city,
      postalCode: addr.postalCode ?? '',
      province: addr.province ?? '',
      country: addr.country ?? '',
      addressType: addr.addressType,
      label: addr.label ?? '',
      isDefault: addr.isDefault,
    });
    // Seed custom-field values for the address's current type. Update the
    // ref so the type-change effect doesn't immediately wipe them.
    prevAddressType.current = addr.addressType;
    setTypeData((addr.typeData as Record<string, unknown> | undefined) ?? {});
    setEditingAddressId(addr.id);
    setShowAddressForm(true);
  }

  async function handleDeleteAddress(addressId: string) {
    if (!clientId) return;
    await deleteAddress.mutateAsync({ clientId, addressId });
  }

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...modalStyles.content, maxWidth: '620px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>{title}</h2>
          <button onClick={onCancel} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <div style={{ ...modalStyles.body }}>
          <form id="client-form" onSubmit={handleSubmit(handleMainSubmit)}>
            <p style={{ margin: '0 0 0.75rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Informations client
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ ...formStyles.label }}>{t('fields.firstName')} <span style={{ color: theme.colors.danger }}>*</span></label>
                <input style={{ ...formStyles.input }} placeholder={t('fields.firstName')} {...register('firstName', { required: tCommon('validation.required') })} />
                {errors.firstName && <span style={{ ...formStyles.fieldError }}>{errors.firstName.message}</span>}
              </div>
              <div>
                <label style={{ ...formStyles.label }}>{t('fields.lastName')} <span style={{ color: theme.colors.danger }}>*</span></label>
                <input style={{ ...formStyles.input }} placeholder={t('fields.lastName')} {...register('lastName', { required: tCommon('validation.required') })} />
                {errors.lastName && <span style={{ ...formStyles.fieldError }}>{errors.lastName.message}</span>}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ ...formStyles.label }}>{t('fields.companyName')} <span style={{ color: theme.colors.textMuted, fontWeight: theme.font.weightNormal, fontSize: theme.font.sizeXs }}>{tCommon('labels.optional')}</span></label>
                <input style={{ ...formStyles.input }} placeholder="Ex: Construction ABC inc." {...register('companyName')} />
              </div>
              <div>
                <label style={{ ...formStyles.label }}>{t('fields.clientType')} <span style={{ color: theme.colors.danger }}>*</span></label>
                <select style={{ ...formStyles.select }} {...register('clientType', { required: true })}>
                  {Object.values(ClientType).map((code) => (
                    <option key={code} value={code}>{clientTypeLabel(t, code)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...formStyles.label }}>{t('fields.email')}</label>
                <input style={{ ...formStyles.input }} type="email" placeholder="email@exemple.com" {...register('email')} />
              </div>
              <div>
                <label style={{ ...formStyles.label }}>{t('fields.phone')}</label>
                <input style={{ ...formStyles.input }} placeholder="514-000-0000" {...register('phone')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ ...formStyles.label }}>{t('fields.notes')}</label>
                <textarea style={{ ...formStyles.textarea }} placeholder={t('fields.notesPlaceholder', { defaultValue: 'Notes ou informations supplémentaires...' })} {...register('notes')} />
              </div>
            </div>

            {isError && (
              <p style={{ ...formStyles.fieldError, marginBottom: '0.75rem' }}>
                Une erreur est survenue. Veuillez réessayer.
              </p>
            )}
          </form>

          {/* Addresses section
              - edit mode (clientId known): shows existing addresses + inline edit/add form
              - create mode: shows just the inline form button to attach one address with the new client */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: theme.borders.default }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {clientId
                    ? `${t('fields.addresses')} (${existingAddresses?.length ?? 0})`
                    : `${tCommon('labels.initialAddress', { defaultValue: 'Adresse initiale' })} ${tCommon('labels.optional')}`}
                </p>
                {!showAddressForm && (
                  <button
                    type="button"
                    onClick={() => {
                      addressForm.reset({
                        addressType: AddressType.WORKSITE,
                        country: 'Canada',
                        province: 'QC',
                        isDefault: false,
                      });
                      setTypeData({});
                      prevAddressType.current = AddressType.WORKSITE;
                      setEditingAddressId(null);
                      setShowAddressForm(true);
                    }}
                    style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                  >
                    + {tCommon('actions.add')}
                  </button>
                )}
              </div>

              {existingAddresses && existingAddresses.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {existingAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.625rem 0.875rem',
                        background: theme.colors.surfaceAlt,
                        border: theme.borders.light,
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                          {formatStreet(addr)}{addr.apartment ? ` app. ${addr.apartment}` : ''}, {addr.city} {addr.postalCode}
                          {addr.isDefault && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, background: theme.colors.primaryLight, color: theme.colors.primary, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full }}>
                              Défaut
                            </span>
                          )}
                        </p>
                        <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                          {addressTypeLabel(t, addr.addressType)}
                          {addr.label && ` · ${addr.label}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={() => openEditAddress(addr)}
                          disabled={editingAddressId === addr.id}
                          title="Modifier cette adresse"
                          style={{ ...buttonStyles.sm, background: 'none', border: 'none', color: theme.colors.primary, cursor: editingAddressId === addr.id ? 'default' : 'pointer', fontSize: '1rem', padding: '0.25rem', opacity: editingAddressId === addr.id ? 0.4 : 1 }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(addr.id)}
                          disabled={deleteAddress.isPending}
                          title="Supprimer cette adresse"
                          style={{ ...buttonStyles.sm, background: 'none', border: 'none', color: theme.colors.danger, cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAddressForm && (
                <>
                  <AddressFormFields
                    form={addressForm}
                    title={editingAddressId ? 'Modifier l\'adresse' : 'Nouvelle adresse'}
                  />
                  {customFields.length > 0 && (
                    <AddressTypeCustomFields
                      fields={customFields}
                      values={typeData}
                      onChange={setTypeData}
                    />
                  )}
                </>
              )}
              {showAddressForm && (
                <button
                  type="button"
                  onClick={() => { addressForm.reset(); setTypeData({}); setEditingAddressId(null); setShowAddressForm(false); }}
                  style={{ ...buttonStyles.ghost, ...buttonStyles.sm, marginTop: '0.5rem' }}
                >
                  {editingAddressId
                    ? tCommon('actions.cancelEdit', { defaultValue: 'Annuler la modification' })
                    : (clientId
                      ? tCommon('actions.cancelAddAddress', { defaultValue: "Annuler l'ajout d'adresse" })
                      : tCommon('actions.removeInitialAddress', { defaultValue: "Retirer l'adresse initiale" }))}
                </button>
              )}
          </div>
        </div>

        <div style={{ ...modalStyles.footer }}>
          <button type="button" onClick={onCancel} style={{ ...buttonStyles.secondary }}>
            {tCommon('actions.cancel')}
          </button>
          <button
            type="submit"
            form="client-form"
            disabled={isLoading || addAddress.isPending || updateAddress.isPending}
            style={{ ...buttonStyles.primary, opacity: (isLoading || addAddress.isPending || updateAddress.isPending) ? 0.7 : 1, cursor: (isLoading || addAddress.isPending || updateAddress.isPending) ? 'not-allowed' : 'pointer' }}
          >
            {(isLoading || addAddress.isPending || updateAddress.isPending) ? tCommon('actions.saving') : tCommon('actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Portal access (B21) ──────────────────────────────────────────────────────

function PortalAccessSection({ client }: { client: Client }) {
  const queryClient = useQueryClient();
  const portalUser = client.portalUsers?.[0] ?? null;
  const hasActiveAccess = !!portalUser?.isActive;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['v3-clients'] });
    queryClient.invalidateQueries({ queryKey: ['v3-client', client.id] });
  };

  const invite = useMutation({
    mutationFn: () => invitePortalClient(client.id),
    onSuccess: (res) => {
      toast.success(`Invitation envoyée à ${res.email}`);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const revoke = useMutation({
    mutationFn: () => api.patch(`/users/${portalUser!.id}`, { isActive: false }),
    onSuccess: () => {
      toast.success("Accès au portail révoqué");
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  return (
    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.md, border: theme.borders.light }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Portail client
          </p>
          {portalUser ? (
            <p style={{ margin: '0.2rem 0 0', fontSize: theme.font.sizeSm, color: hasActiveAccess ? theme.colors.success : theme.colors.danger }}>
              {hasActiveAccess ? '✓ Accès actif' : '✗ Accès révoqué'} — {portalUser.email}
              {portalUser.isActive && !portalUser.emailVerifiedAt && (
                <span style={{ color: theme.colors.textMuted }}> (invitation en attente)</span>
              )}
            </p>
          ) : (
            <p style={{ margin: '0.2rem 0 0', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
              Ce client n'a pas encore accès au portail.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => invite.mutate()}
            disabled={invite.isPending || (!client.email && !portalUser)}
            title={!client.email && !portalUser ? 'Ajoutez un courriel à la fiche client' : undefined}
            style={{ ...buttonStyles.secondary, ...buttonStyles.sm, opacity: invite.isPending || (!client.email && !portalUser) ? 0.6 : 1 }}
          >
            {invite.isPending ? 'Envoi…' : portalUser ? "🔁 Renvoyer l'invitation" : '✉️ Inviter au portail'}
          </button>
          {hasActiveAccess && (
            <button
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending}
              style={{ ...buttonStyles.danger, ...buttonStyles.sm, opacity: revoke.isPending ? 0.6 : 1 }}
            >
              🚫 Révoquer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal (view only + addresses) ────────────────────────────────────

function ClientDetailModal({
  client: clientStub,
  onEdit,
  onClose,
}: {
  client: Client;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('clients');
  const deleteAddress = useDeleteClientAddress();
  const { data: fresh } = useV3Client(clientStub.id);
  const client = fresh ?? clientStub;

  async function handleDeleteAddress(addressId: string) {
    await deleteAddress.mutateAsync({ clientId: client.id, addressId });
  }

  const colors = CLIENT_TYPE_COLORS[client.clientType];

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '560px' }}>
        <div style={{ ...modalStyles.header }}>
          <div>
            <h2 style={{ ...modalStyles.headerTitle, marginBottom: '0.25rem' }}>
              {client.firstName} {client.lastName}
            </h2>
            {client.companyName && (
              <p style={{ margin: '0 0 0.375rem', fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                🏢 {client.companyName}
              </p>
            )}
            <ClientTypeBadge type={client.clientType} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onEdit} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>✏️ Modifier</button>
            <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
          </div>
        </div>

        <div style={{ ...modalStyles.body }}>
          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            {client.email && (
              <div>
                <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>Email</p>
                <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>{client.email}</p>
              </div>
            )}
            {client.phone && (
              <div>
                <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>Téléphone</p>
                <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>{client.phone}</p>
              </div>
            )}
            <div>
              <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>Statut</p>
              <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: client.isActive ? theme.colors.success : theme.colors.danger }}>
                {client.isActive ? '✓ Actif' : '✗ Inactif'}
              </p>
            </div>
          </div>
          {client.notes && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.md, border: theme.borders.light }}>
              <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>Notes</p>
              <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>{client.notes}</p>
            </div>
          )}

          {/* Portal access (B21) */}
          <PortalAccessSection client={client} />

          {/* Addresses */}
          <div>
            <p style={{ margin: '0 0 0.75rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('fields.addresses')} ({client.addresses?.length ?? 0})
            </p>
            {(!client.addresses || client.addresses.length === 0) ? (
              <p style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('messages.empty')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {client.addresses.map((addr) => (
                  <div
                    key={addr.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: theme.colors.surfaceAlt,
                      border: theme.borders.light,
                      borderRadius: theme.radius.md,
                      borderLeft: `3px solid ${colors.color}`,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, color: theme.colors.text }}>
                        {formatStreet(addr)}{addr.apartment ? ` app. ${addr.apartment}` : ''}, {addr.city}
                        {addr.postalCode && ` ${addr.postalCode}`}
                        {addr.isDefault && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, background: theme.colors.primaryLight, color: theme.colors.primary, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full }}>
                            Défaut
                          </span>
                        )}
                      </p>
                      <p style={{ margin: '0.125rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                        {addressTypeLabel(t, addr.addressType)}
                        {addr.label && ` · ${addr.label}`}
                        {addr.province && ` · ${addr.province}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      disabled={deleteAddress.isPending}
                      style={{ ...buttonStyles.sm, background: 'none', border: 'none', color: theme.colors.danger, cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...modalStyles.footer }}>
          <button onClick={onClose} style={{ ...buttonStyles.secondary }}>{t('common:actions.close', { defaultValue: 'Fermer' })}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { t } = useTranslation('clients');
  const { t: tCommon } = useTranslation('common');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState<ClientType | ''>('');
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;

  // Debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 350);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchInput]);

  const { data, isLoading, isError } = useV3Clients({
    search: debouncedSearch || undefined,
    clientType: filterType || undefined,
    page,
    limit: LIMIT,
  });

  const createClient = useCreateV3Client();
  const updateClient = useUpdateV3Client();
  const deleteClient = useDeleteV3Client();

  const clients = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  async function handleCreate(
    values: ClientFormValues,
    addresses?: AddressFormValues[],
    addressTypeData?: Record<string, unknown>,
  ) {
    const dto: CreateV3ClientDto & { addresses?: CreateClientAddressDto[] } = {
      firstName: values.firstName,
      lastName: values.lastName,
      companyName: values.companyName || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      clientType: values.clientType,
      notes: values.notes || undefined,
    };
    if (addresses && addresses.length > 0) {
      // Only one inline address is ever submitted from the form (see the modal),
      // so typeData applies to it. Map defensively in case that changes later.
      dto.addresses = addresses.map((a, i) => ({
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
        typeData: i === 0 ? addressTypeData : undefined,
      }));
    }
    const created = await createClient.mutateAsync(dto);
    setShowCreateModal(false);
    setViewingClient(created);
  }

  async function handleUpdate(values: ClientFormValues) {
    if (!editingClient) return;
    await updateClient.mutateAsync({
      id: editingClient.id,
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        companyName: values.companyName || null,
        email: values.email || undefined,
        phone: values.phone || undefined,
        clientType: values.clientType,
        notes: values.notes || undefined,
      },
    });
    setEditingClient(null);
  }

  async function handleDelete(id: string) {
    await deleteClient.mutateAsync(id);
    setDeleteConfirmId(null);
    if (viewingClient?.id === id) setViewingClient(null);
  }

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* Header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>{t('title')}</h1>
          {total > 0 && (
            <p style={{ ...layoutStyles.pageSubtitle }}>
              {total} client{total > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{ ...buttonStyles.primary }}
        >
          {t('create')}
        </button>
      </div>

      {/* CSV import / export — ADMIN only, hidden for other roles */}
      <CsvImportExportPanel
        title={t('csv:clients.title', 'Import / export clients')}
        helpText={t('csv:clients.help')}
        onDownloadTemplate={downloadClientTemplate}
        onExport={exportClientsCsv}
        onImport={importClientsCsv}
        invalidateKeys={[['clients']]}
      />

      {/* Filters */}
      <div style={{ ...layoutStyles.filterBar }}>
        <input
          style={{ ...formStyles.input, maxWidth: '320px' }}
          placeholder={t('messages.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          style={{ ...formStyles.select, maxWidth: '180px' }}
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value as ClientType | ''); setPage(1); }}
        >
          <option value="">Tous les types</option>
          {Object.values(ClientType).map((code) => (
            <option key={code} value={code}>{clientTypeLabel(t, code)}</option>
          ))}
        </select>
        {(searchInput || filterType) && (
          <button
            onClick={() => { setSearchInput(''); setFilterType(''); setPage(1); }}
            style={{ ...buttonStyles.ghost, ...buttonStyles.sm }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <div style={{ color: theme.colors.danger, padding: '1rem' }}>Erreur lors du chargement des clients.</div>
      ) : clients.length === 0 ? (
        <div style={{ ...layoutStyles.emptyState, ...{ background: theme.colors.surface, border: theme.borders.default, borderRadius: theme.radius.lg } }}>
          <span style={{ fontSize: '2.5rem' }}>👥</span>
          <p style={{ margin: 0 }}>
            {debouncedSearch || filterType
              ? 'Aucun client ne correspond à vos filtres.'
              : 'Aucun client enregistré. Commencez par en créer un.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={{ ...tableStyles.container, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  {['Nom', 'Type', 'Email', 'Téléphone', 'Adresses', ''].map((h) => (
                    <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client, index) => (
                  <tr
                    key={client.id}
                    style={getRowStyle(index, hoveredRow === index)}
                    onMouseEnter={() => setHoveredRow(index)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                      <button
                        onClick={() => setViewingClient(client)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: theme.colors.primary, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeSm, textAlign: 'left' }}
                      >
                        {client.firstName} {client.lastName}
                      </button>
                      {client.companyName && (
                        <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: '0.125rem' }}>
                          🏢 {client.companyName}
                        </div>
                      )}
                      {!client.isActive && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', background: theme.colors.dangerLight, color: theme.colors.danger, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, fontWeight: theme.font.weightSemibold }}>
                          Inactif
                        </span>
                      )}
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      <ClientTypeBadge type={client.clientType} />
                    </td>
                    <td style={{ ...tableStyles.cellMuted }}>
                      {client.email || <span style={{ color: theme.colors.textLight }}>—</span>}
                    </td>
                    <td style={{ ...tableStyles.cellMuted }}>
                      {client.phone || <span style={{ color: theme.colors.textLight }}>—</span>}
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      <span style={{ fontSize: theme.font.sizeXs, background: theme.colors.background, border: theme.borders.light, borderRadius: theme.radius.full, padding: '0.2rem 0.6rem', color: theme.colors.textSecondary }}>
                        {client.addresses?.length ?? 0} adresse{(client.addresses?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
                      {deleteConfirmId === client.id ? (
                        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>{t('common:actions.confirm', { defaultValue: 'Confirmer' })} ?</span>
                          <button onClick={() => handleDelete(client.id)} disabled={deleteClient.isPending} style={{ ...buttonStyles.danger, ...buttonStyles.sm }}>
                            Oui
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
                            Non
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setViewingClient(client)}
                            style={{ ...buttonStyles.ghost, ...buttonStyles.sm }}
                          >
                            👁
                          </button>
                          <button
                            onClick={() => setEditingClient(client)}
                            style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(client.id)}
                            style={{ ...buttonStyles.sm, background: 'none', border: `1px solid ${theme.colors.danger}40`, color: theme.colors.danger, padding: '0.25rem 0.625rem', borderRadius: theme.radius.sm, cursor: 'pointer', fontSize: theme.font.sizeXs }}
                          >
                            🗑
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ padding: '0.4rem 0.875rem', border: theme.borders.default, borderRadius: theme.radius.sm, cursor: page === 1 ? 'default' : 'pointer', background: page === 1 ? theme.colors.surfaceAlt : theme.colors.surface, color: theme.colors.text }}
              >
                ‹
              </button>
              <span style={{ padding: '0.4rem 0.875rem', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
                Page {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '0.4rem 0.875rem', border: theme.borders.default, borderRadius: theme.radius.sm, cursor: page === totalPages ? 'default' : 'pointer', background: page === totalPages ? theme.colors.surfaceAlt : theme.colors.surface, color: theme.colors.text }}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <ClientModal
          title="Nouveau client"
          onSubmit={handleCreate}
          onCancel={() => { setShowCreateModal(false); createClient.reset(); }}
          isLoading={createClient.isPending}
          isError={createClient.isError}
        />
      )}

      {/* Edit Modal */}
      {editingClient && (
        <ClientModal
          title={`Modifier — ${editingClient.firstName} ${editingClient.lastName}`}
          defaultValues={{
            firstName: editingClient.firstName,
            lastName: editingClient.lastName,
            companyName: editingClient.companyName ?? '',
            email: editingClient.email ?? '',
            phone: editingClient.phone ?? '',
            clientType: editingClient.clientType,
            notes: editingClient.notes ?? '',
          }}
          clientId={editingClient.id}
          onSubmit={handleUpdate}
          onCancel={() => setEditingClient(null)}
          isLoading={updateClient.isPending}
          isError={updateClient.isError}
        />
      )}

      {/* View Detail Modal */}
      {viewingClient && !editingClient && (
        <ClientDetailModal
          client={viewingClient}
          onEdit={() => { setEditingClient(viewingClient); setViewingClient(null); }}
          onClose={() => setViewingClient(null)}
        />
      )}
    </div>
  );
}
