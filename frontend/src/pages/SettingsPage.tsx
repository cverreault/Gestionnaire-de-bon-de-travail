import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  useTaskTypes,
  useCreateTaskType,
  useUpdateTaskType,
  useDeleteTaskType,
  useClientTypes,
  useCreateClientType,
  useUpdateClientType,
  useDeleteClientType,
  useAddressTypes,
  useCreateAddressType,
  useUpdateAddressType,
  useDeleteAddressType,
} from '../hooks/useSettings';
import type { TaskType, ClientTypeConfig, AddressTypeConfig } from '../types';
import AddressTypeFieldsModal from '../components/AddressTypeFieldsModal';
import { useTemplates } from '../hooks/useTemplates';
import { useProcesses } from '../hooks/useProcess';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  theme,
  tableStyles,
  buttonStyles,
  formStyles,
  modalStyles,
  layoutStyles,
  getRowStyle,
} from '../theme';

// ─── Form Types ────────────────────────────────────────────────────────────────

interface TaskTypeFormValues {
  prefix: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  templateId: string;
  processDefinitionId: string;
}

interface ConfigTypeFormValues {
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: string;
}

/**
 * Pull the user-facing message from an axios error response. NestJS validation
 * pipes return `{ message: string | string[], error: string, statusCode: number }`.
 * Falls back to a generic message when the shape is unknown.
 */
function extractApiErrorMessage(err: unknown): string | null {
  if (!err) return null;
  const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
  const msg = axiosErr?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(' · ');
  if (typeof msg === 'string') return msg;
  return null;
}

// ─── TaskType Modal ───────────────────────────────────────────────────────────

/**
 * Curated emoji palette for task types — covers the main trades and operations.
 * Selection is purely cosmetic (stored as a free-form string on TaskType.icon),
 * so users can still type something off-list in the input field below.
 */
const TASK_TYPE_ICON_CHOICES = [
  '📋', '🔧', '🔨', '🛠️', '🪛', '🧰', '⚙️', '🔌', '⚡',
  '💡', '🪜', '🪟', '🚪', '🔍', '🚜', '🚚', '🚐', '🏗️',
  '🪠', '🚿', '💧', '🌡️', '🔥', '🧯', '❄️', '🌬️', '🍃',
  '🪴', '🌳', '🧹', '🧽', '📦', '📐', '📏', '🎯', '✅',
];


function TaskTypeModal({
  title,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  isError,
  errorMessage,
}: {
  title: string;
  defaultValues?: Partial<TaskTypeFormValues>;
  onSubmit: (values: TaskTypeFormValues) => void;
  onCancel: () => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | null;
}) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskTypeFormValues>({
    defaultValues: {
      prefix: defaultValues?.prefix ?? '',
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      color: defaultValues?.color ?? '#3b82f6',
      icon: defaultValues?.icon ?? '',
      templateId: defaultValues?.templateId ?? '',
      processDefinitionId: defaultValues?.processDefinitionId ?? '',
    },
  });
  const { data: templates = [] } = useTemplates();
  const { data: processesData } = useProcesses({ isActive: true });
  const processes = processesData?.data ?? [];

  const watchedColor = watch('color', defaultValues?.color ?? '#3b82f6');

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...modalStyles.content, maxWidth: '480px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>{title}</h2>
          <button onClick={onCancel} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <div style={{ ...modalStyles.body }}>
            {/* Prefix */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>
                {tCommon('labels.prefix')} <span style={{ color: theme.colors.danger }}>*</span>
              </label>
              <input
                style={{ ...formStyles.input, fontFamily: 'monospace', textTransform: 'uppercase', maxWidth: '160px' }}
                placeholder="PLB, ELC, MNT..."
                {...register('prefix', {
                  required: 'Le préfixe est obligatoire',
                  maxLength: { value: 10, message: '10 caractères maximum' },
                  pattern: {
                    value: /^[A-Z0-9]+$/,
                    message: 'Lettres et chiffres uniquement (pas de tirets ni espaces)',
                  },
                  setValueAs: (v: string) => v.toUpperCase(),
                })}
                onChange={(e) => {
                  // Strip anything that isn't a letter or digit, then upper-case.
                  // The DB reserves '-' as a separator in reference numbers (PREFIX-DATE-SEQ).
                  e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                  register('prefix').onChange(e);
                }}
              />
              {errors.prefix && <span style={{ ...formStyles.fieldError }}>{errors.prefix.message}</span>}
              <p style={{ ...formStyles.fieldHint }}>{t('taskType.prefixHint')}</p>
            </div>

            {/* Name */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>
                {tCommon('labels.name')} <span style={{ color: theme.colors.danger }}>*</span>
              </label>
              <input
                style={{ ...formStyles.input }}
                placeholder="Ex: Inspection réseau"
                {...register('name', { required: 'Le nom est obligatoire' })}
              />
              {errors.name && <span style={{ ...formStyles.fieldError }}>{errors.name.message}</span>}
            </div>

            {/* Description */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{tCommon('labels.description')}</label>
              <textarea
                style={{ ...formStyles.textarea }}
                placeholder="Description du type de tâche..."
                rows={3}
                {...register('description')}
              />
            </div>

            {/* Color + preview */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{tCommon('labels.color')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  style={{ width: '3rem', height: '2.25rem', border: theme.borders.default, borderRadius: theme.radius.md, cursor: 'pointer', padding: '0.125rem' }}
                  value={watchedColor}
                  onChange={(e) => setValue('color', e.target.value)}
                />
                <input
                  style={{ ...formStyles.input, fontFamily: 'monospace', maxWidth: '120px' }}
                  placeholder="#3b82f6"
                  {...register('color')}
                />
                <span
                  style={{
                    display: 'inline-block',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: theme.radius.full,
                    background: watchedColor,
                    border: theme.borders.default,
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>

            {/* Icon */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{tCommon('labels.icon')}</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                gap: '0.375rem',
                marginBottom: '0.5rem',
              }}>
                {TASK_TYPE_ICON_CHOICES.map((emoji) => {
                  const selected = watch('icon') === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setValue('icon', emoji, { shouldDirty: true })}
                      style={{
                        fontSize: '1.4rem',
                        padding: '0.4rem',
                        background: selected ? theme.colors.primaryLight : theme.colors.surface,
                        border: `2px solid ${selected ? theme.colors.primary : theme.colors.border}`,
                        borderRadius: theme.radius.md,
                        cursor: 'pointer',
                        lineHeight: 1,
                        transition: 'all 0.15s ease',
                      }}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  style={{ ...formStyles.input, maxWidth: '200px' }}
                  placeholder="Ou saisir un emoji / texte court"
                  {...register('icon')}
                />
                {watch('icon') && (
                  <span style={{ fontSize: '1.5rem' }}>{watch('icon')}</span>
                )}
              </div>
              <p style={{ ...formStyles.fieldHint }}>Choisissez une icône ci-dessus ou saisissez un emoji / une courte abréviation.</p>
            </div>

            {/* Template */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('taskType.template')}</label>
              <select
                style={{ ...formStyles.select, boxSizing: 'border-box' }}
                {...register('templateId')}
              >
                <option value="">{t('taskType.templateNone')}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id} disabled={!t.isActive}>
                    {t.name}{!t.isActive ? ' (inactif)' : ''}
                  </option>
                ))}
              </select>
              <p style={{ ...formStyles.fieldHint }}>
                Si défini, ses sections et champs apparaissent automatiquement à la création/édition d'un BT de ce type.
                {' '}<Link to="/parametres/templates" style={{ color: theme.colors.primary }}>{t('taskType.manageTemplates')}</Link>
              </p>
            </div>

            {/* Process */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{t('taskType.process')}</label>
              <select
                style={{ ...formStyles.select, boxSizing: 'border-box' }}
                {...register('processDefinitionId')}
              >
                <option value="">— Processus par défaut —</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.isDefault ? ' (défaut)' : ''}
                  </option>
                ))}
              </select>
              <p style={{ ...formStyles.fieldHint }}>
                Les BT créés pour ce type suivront les étapes de ce processus. Laisser vide pour utiliser le processus par défaut.
                {' '}<Link to="/parametres/processus" style={{ color: theme.colors.primary }}>{t('taskType.manageProcesses')}</Link>
              </p>
            </div>

            {isError && (
              <p style={{ ...formStyles.fieldError }}>
                {errorMessage ?? 'Une erreur est survenue. Veuillez réessayer.'}
              </p>
            )}
          </div>

          <div style={{ ...modalStyles.footer }}>
            <button type="button" onClick={onCancel} style={{ ...buttonStyles.secondary }}>
              {tCommon('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{ ...buttonStyles.primary, opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              {isLoading ? tCommon('actions.saving') : tCommon('actions.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ConfigType Modal (Client / Address) ──────────────────────────────────────

function ConfigTypeModal({
  title,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  isError,
}: {
  title: string;
  defaultValues?: Partial<ConfigTypeFormValues>;
  onSubmit: (values: ConfigTypeFormValues) => void;
  onCancel: () => void;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t: tCommon } = useTranslation('common');
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConfigTypeFormValues>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      code: defaultValues?.code ?? '',
      description: defaultValues?.description ?? '',
      color: defaultValues?.color ?? '#3b82f6',
      icon: defaultValues?.icon ?? '',
      sortOrder: defaultValues?.sortOrder ?? '0',
    },
  });

  const watchedColor = watch('color', defaultValues?.color ?? '#3b82f6');

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...modalStyles.content, maxWidth: '500px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>{title}</h2>
          <button onClick={onCancel} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <div style={{ ...modalStyles.body }}>
            {/* Name */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>
                {tCommon('labels.name')} <span style={{ color: theme.colors.danger }}>*</span>
              </label>
              <input
                style={{ ...formStyles.input }}
                placeholder="Ex: Résidentiel"
                {...register('name', { required: 'Le nom est obligatoire' })}
              />
              {errors.name && <span style={{ ...formStyles.fieldError }}>{errors.name.message}</span>}
            </div>

            {/* Code */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>
                Code <span style={{ color: theme.colors.danger }}>*</span>
              </label>
              <input
                style={{ ...formStyles.input, fontFamily: 'monospace', textTransform: 'uppercase' }}
                placeholder="Ex: RESIDENTIAL"
                {...register('code', {
                  required: 'Le code est obligatoire',
                  pattern: {
                    value: /^[A-Z0-9_]+$/,
                    message: 'Majuscules, chiffres et underscores uniquement',
                  },
                  setValueAs: (v: string) => v.toUpperCase(),
                })}
              />
              {errors.code && <span style={{ ...formStyles.fieldError }}>{errors.code.message}</span>}
              <p style={{ ...formStyles.fieldHint }}>Identifiant technique unique. Ex : RESIDENTIAL, COMMERCIAL</p>
            </div>

            {/* Description */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{tCommon('labels.description')}</label>
              <textarea
                style={{ ...formStyles.textarea }}
                placeholder="Description de ce type..."
                rows={2}
                {...register('description')}
              />
            </div>

            {/* Color + preview */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>{tCommon('labels.color')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  style={{ width: '3rem', height: '2.25rem', border: theme.borders.default, borderRadius: theme.radius.md, cursor: 'pointer', padding: '0.125rem' }}
                  value={watchedColor}
                  onChange={(e) => setValue('color', e.target.value)}
                />
                <input
                  style={{ ...formStyles.input, fontFamily: 'monospace', maxWidth: '120px' }}
                  placeholder="#3b82f6"
                  {...register('color')}
                />
                <span
                  style={{
                    display: 'inline-block',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: theme.radius.full,
                    background: watchedColor,
                    border: theme.borders.default,
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>

            {/* Icon */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>Icône (emoji ou texte court)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  style={{ ...formStyles.input, maxWidth: '200px' }}
                  placeholder="Ex: 🏠 ou RES"
                  {...register('icon')}
                />
                {watch('icon') && (
                  <span style={{ fontSize: '1.5rem' }}>{watch('icon')}</span>
                )}
              </div>
            </div>

            {/* Sort order */}
            <div style={{ ...formStyles.fieldGroup }}>
              <label style={{ ...formStyles.label }}>Ordre d'affichage</label>
              <input
                type="number"
                style={{ ...formStyles.input, maxWidth: '100px' }}
                min={0}
                {...register('sortOrder')}
              />
            </div>

            {isError && (
              <p style={{ ...formStyles.fieldError }}>
                Une erreur est survenue. Veuillez réessayer.
              </p>
            )}
          </div>

          <div style={{ ...modalStyles.footer }}>
            <button type="button" onClick={onCancel} style={{ ...buttonStyles.secondary }}>
              {tCommon('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{ ...buttonStyles.primary, opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              {isLoading ? tCommon('actions.saving') : tCommon('actions.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ConfigTypeTable — table CRUD générique pour ClientType / AddressType ─────

function ConfigTypeTable<T extends ClientTypeConfig | AddressTypeConfig>({
  sectionIcon,
  title,
  subtitle,
  items,
  isLoading,
  isError,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
  onCustomFields,
  isUpdating,
  isDeleting,
}: {
  sectionIcon: string;
  title: string;
  subtitle: string;
  items: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onCreate: () => void;
  onEdit: (item: T) => void;
  onToggleActive: (item: T) => void;
  onDelete: (id: string) => void;
  /** Optional — when provided, a "🔧 Champs" button appears on each row. */
  onCustomFields?: (item: T) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  return (
    <div
      style={{
        background: theme.colors.surface,
        border: theme.borders.default,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.sm,
        overflow: 'hidden',
        marginBottom: '2rem',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: theme.borders.default,
          background: theme.colors.surfaceAlt,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: theme.font.sizeLg, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
            {sectionIcon} {title}
          </h2>
          <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
            {subtitle}
          </p>
        </div>
        <button
          onClick={onCreate}
          style={{ ...buttonStyles.primary }}
        >
          + Nouveau type
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '2rem' }}><LoadingSpinner /></div>
      ) : isError ? (
        <div style={{ padding: '1rem', color: theme.colors.danger }}>
          Erreur lors du chargement des données.
        </div>
      ) : !items || items.length === 0 ? (
        <div style={{ ...layoutStyles.emptyState }}>
          <span style={{ fontSize: '2.5rem' }}>{sectionIcon}</span>
          <p style={{ margin: 0 }}>Aucun type configuré. Créez-en un pour commencer.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ ...tableStyles.header }}>
            <tr>
              {['Couleur', 'Icône', 'Code', 'Nom', 'Description', 'Statut', ''].map((h) => (
                <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.id}
                style={getRowStyle(index, hoveredRow === index)}
                onMouseEnter={() => setHoveredRow(index)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Color dot */}
                <td style={{ ...tableStyles.cell, width: '56px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1.25rem',
                      height: '1.25rem',
                      borderRadius: theme.radius.full,
                      background: item.color ?? theme.colors.primary,
                      border: theme.borders.light,
                      verticalAlign: 'middle',
                    }}
                    title={item.color ?? '—'}
                  />
                </td>

                {/* Icon */}
                <td style={{ ...tableStyles.cell, width: '56px', fontSize: '1.25rem', textAlign: 'center' }}>
                  {item.icon || <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeSm }}>—</span>}
                </td>

                {/* Code */}
                <td style={{ ...tableStyles.cell, width: '160px' }}>
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontSize: theme.font.sizeXs,
                      background: theme.colors.background,
                      border: theme.borders.light,
                      borderRadius: theme.radius.sm,
                      padding: '0.125rem 0.375rem',
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {item.code}
                  </code>
                </td>

                {/* Name */}
                <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                  {item.name}
                </td>

                {/* Description */}
                <td style={{ ...tableStyles.cellMuted, maxWidth: '220px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {item.description || <span style={{ color: theme.colors.textLight }}>—</span>}
                  </span>
                </td>

                {/* Active toggle */}
                <td style={{ ...tableStyles.cell }}>
                  <button
                    onClick={() => onToggleActive(item)}
                    disabled={isUpdating}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: theme.radius.full,
                      border: 'none',
                      fontSize: theme.font.sizeXs,
                      fontWeight: theme.font.weightSemibold,
                      cursor: 'pointer',
                      background: item.isActive ? theme.colors.successLight : theme.colors.dangerLight,
                      color: item.isActive ? '#065f46' : '#991b1b',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.isActive ? '✓ Actif' : '✗ Inactif'}
                  </button>
                </td>

                {/* Actions */}
                <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
                  {deleteConfirmId === item.id ? (
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>Confirmer ?</span>
                      <button
                        onClick={() => { onDelete(item.id); setDeleteConfirmId(null); }}
                        disabled={isDeleting}
                        style={{ ...buttonStyles.danger, ...buttonStyles.sm }}
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                      >
                        Non
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => onEdit(item)}
                        style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                      >
                        ✏️ Modifier
                      </button>
                      {onCustomFields && (
                        <button
                          onClick={() => onCustomFields(item)}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                          title="Champs personnalisés et champ prédominant"
                        >
                          🔧 Champs
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirmId(item.id)}
                        style={{
                          ...buttonStyles.sm,
                          background: 'none',
                          border: `1px solid ${theme.colors.danger}40`,
                          color: theme.colors.danger,
                          padding: '0.25rem 0.625rem',
                          borderRadius: theme.radius.sm,
                          cursor: 'pointer',
                          fontSize: theme.font.sizeXs,
                        }}
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
      )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  // ── TaskType state ──────────────────────────────────────────────────────────
  const [showCreateTaskTypeModal, setShowCreateTaskTypeModal] = useState(false);
  const [editingTaskType, setEditingTaskType] = useState<TaskType | null>(null);
  const [deleteTaskTypeConfirmId, setDeleteTaskTypeConfirmId] = useState<string | null>(null);
  const [hoveredTaskTypeRow, setHoveredTaskTypeRow] = useState<number | null>(null);

  const { data: taskTypes, isLoading: ttLoading, isError: ttError } = useTaskTypes();
  const createTaskType = useCreateTaskType();
  const updateTaskType = useUpdateTaskType();
  const deleteTaskType = useDeleteTaskType();

  // ── ClientType state ────────────────────────────────────────────────────────
  const [showCreateClientTypeModal, setShowCreateClientTypeModal] = useState(false);
  const [editingClientType, setEditingClientType] = useState<ClientTypeConfig | null>(null);

  const { data: clientTypes, isLoading: ctLoading, isError: ctError } = useClientTypes();
  const createClientType = useCreateClientType();
  const updateClientType = useUpdateClientType();
  const deleteClientType = useDeleteClientType();

  // ── AddressType state ───────────────────────────────────────────────────────
  const [showCreateAddressTypeModal, setShowCreateAddressTypeModal] = useState(false);
  const [editingAddressType, setEditingAddressType] = useState<AddressTypeConfig | null>(null);
  const [managingFieldsForType, setManagingFieldsForType] = useState<AddressTypeConfig | null>(null);

  const { data: addressTypes, isLoading: atLoading, isError: atError } = useAddressTypes();
  const createAddressType = useCreateAddressType();
  const updateAddressType = useUpdateAddressType();
  const deleteAddressType = useDeleteAddressType();

  // ── TaskType handlers ───────────────────────────────────────────────────────

  async function handleCreateTaskType(values: TaskTypeFormValues) {
    await createTaskType.mutateAsync({
      prefix: values.prefix,
      name: values.name,
      description: values.description || undefined,
      color: values.color || undefined,
      icon: values.icon || undefined,
      templateId: values.templateId || null,
      processDefinitionId: values.processDefinitionId || null,
    });
    setShowCreateTaskTypeModal(false);
  }

  async function handleUpdateTaskType(values: TaskTypeFormValues) {
    if (!editingTaskType) return;
    await updateTaskType.mutateAsync({
      id: editingTaskType.id,
      data: {
        prefix: values.prefix,
        name: values.name,
        description: values.description || undefined,
        color: values.color || undefined,
        icon: values.icon || undefined,
        templateId: values.templateId || null,
        processDefinitionId: values.processDefinitionId || null,
      },
    });
    setEditingTaskType(null);
  }

  async function handleToggleTaskTypeActive(tt: TaskType) {
    await updateTaskType.mutateAsync({ id: tt.id, data: { isActive: !tt.isActive } });
  }

  async function handleDeleteTaskType(id: string) {
    await deleteTaskType.mutateAsync(id);
    setDeleteTaskTypeConfirmId(null);
  }

  // ── ClientType handlers ─────────────────────────────────────────────────────

  async function handleCreateClientType(values: ConfigTypeFormValues) {
    await createClientType.mutateAsync({
      name: values.name,
      code: values.code,
      description: values.description || undefined,
      color: values.color || undefined,
      icon: values.icon || undefined,
      sortOrder: parseInt(values.sortOrder, 10) || 0,
    });
    setShowCreateClientTypeModal(false);
  }

  async function handleUpdateClientType(values: ConfigTypeFormValues) {
    if (!editingClientType) return;
    await updateClientType.mutateAsync({
      id: editingClientType.id,
      data: {
        name: values.name,
        code: values.code,
        description: values.description || undefined,
        color: values.color || undefined,
        icon: values.icon || undefined,
        sortOrder: parseInt(values.sortOrder, 10) || 0,
      },
    });
    setEditingClientType(null);
  }

  async function handleToggleClientTypeActive(item: ClientTypeConfig) {
    await updateClientType.mutateAsync({ id: item.id, data: { isActive: !item.isActive } });
  }

  async function handleDeleteClientType(id: string) {
    await deleteClientType.mutateAsync(id);
  }

  // ── AddressType handlers ────────────────────────────────────────────────────

  async function handleCreateAddressType(values: ConfigTypeFormValues) {
    await createAddressType.mutateAsync({
      name: values.name,
      code: values.code,
      description: values.description || undefined,
      color: values.color || undefined,
      icon: values.icon || undefined,
      sortOrder: parseInt(values.sortOrder, 10) || 0,
    });
    setShowCreateAddressTypeModal(false);
  }

  async function handleUpdateAddressType(values: ConfigTypeFormValues) {
    if (!editingAddressType) return;
    await updateAddressType.mutateAsync({
      id: editingAddressType.id,
      data: {
        name: values.name,
        code: values.code,
        description: values.description || undefined,
        color: values.color || undefined,
        icon: values.icon || undefined,
        sortOrder: parseInt(values.sortOrder, 10) || 0,
      },
    });
    setEditingAddressType(null);
  }

  async function handleToggleAddressTypeActive(item: AddressTypeConfig) {
    await updateAddressType.mutateAsync({ id: item.id, data: { isActive: !item.isActive } });
  }

  async function handleDeleteAddressType(id: string) {
    await deleteAddressType.mutateAsync(id);
  }

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* Page header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>⚙️ {t('title')}</h1>
          <p style={{ ...layoutStyles.pageSubtitle }}>{t('subtitle', { defaultValue: "Administration des référentiels de l'application" })}</p>
        </div>
      </div>

      {/* ── Accès rapide: Templates de formulaire ─────────────────────────── */}
      <Link
        to="/parametres/templates"
        style={{ textDecoration: 'none', display: 'block', marginBottom: '1rem' }}
      >
        <div
          style={{
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.lg,
            boxShadow: theme.shadows.sm,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            cursor: 'pointer',
            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.md;
            (e.currentTarget as HTMLDivElement).style.borderColor = theme.colors.primary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.sm;
            (e.currentTarget as HTMLDivElement).style.borderColor = '';
          }}
        >
          <span style={{ fontSize: '2rem', flexShrink: 0 }}>📋</span>
          <div>
            <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeMd, color: theme.colors.text }}>
              Templates de formulaire
            </p>
            <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
              Construire des sections et champs personnalisés pour les bons de travail
            </p>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: theme.font.sizeLg, color: theme.colors.textLight }}>›</span>
        </div>
      </Link>

      {/* ── Accès rapide: Moteur de processus ─────────────────────────────── */}
      <Link
        to="/parametres/processus"
        style={{ textDecoration: 'none', display: 'block', marginBottom: '2rem' }}
      >
        <div
          style={{
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.lg,
            boxShadow: theme.shadows.sm,
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            cursor: 'pointer',
            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.md;
            (e.currentTarget as HTMLDivElement).style.borderColor = theme.colors.primary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.sm;
            (e.currentTarget as HTMLDivElement).style.borderColor = '';
          }}
        >
          <span style={{ fontSize: '2rem', flexShrink: 0 }}>🔀</span>
          <div>
            <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeMd, color: theme.colors.text }}>
              Moteur de processus
            </p>
            <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
              Configurer les étapes et transitions des bons de travail
            </p>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: theme.font.sizeLg, color: theme.colors.textLight }}>›</span>
        </div>
      </Link>

      {/* ── Section: Types de tâches ────────────────────────────────────────── */}
      <div
        style={{
          background: theme.colors.surface,
          border: theme.borders.default,
          borderRadius: theme.radius.lg,
          boxShadow: theme.shadows.sm,
          overflow: 'hidden',
          marginBottom: '2rem',
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: theme.borders.default,
            background: theme.colors.surfaceAlt,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: theme.font.sizeLg, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
              📋 Types de tâches
            </h2>
            <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginTop: '0.125rem' }}>
              Catégories de bons de travail disponibles dans le formulaire de création
            </p>
          </div>
          <button
            onClick={() => setShowCreateTaskTypeModal(true)}
            style={{ ...buttonStyles.primary }}
          >
            + Nouveau type
          </button>
        </div>

        {/* Content */}
        {ttLoading ? (
          <div style={{ padding: '2rem' }}><LoadingSpinner /></div>
        ) : ttError ? (
          <div style={{ padding: '1rem', color: theme.colors.danger }}>
            Erreur lors du chargement des types de tâches.
          </div>
        ) : !taskTypes || taskTypes.length === 0 ? (
          <div style={{ ...layoutStyles.emptyState }}>
            <span style={{ fontSize: '2.5rem' }}>📋</span>
            <p style={{ margin: 0 }}>Aucun type de tâche. Créez-en un pour commencer.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ ...tableStyles.header }}>
              <tr>
                {['Couleur', 'Icône', 'Préfixe', 'Nom', 'Description', 'Statut', ''].map((h) => (
                  <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskTypes.map((tt, index) => (
                <tr
                  key={tt.id}
                  style={getRowStyle(index, hoveredTaskTypeRow === index)}
                  onMouseEnter={() => setHoveredTaskTypeRow(index)}
                  onMouseLeave={() => setHoveredTaskTypeRow(null)}
                >
                  {/* Color dot */}
                  <td style={{ ...tableStyles.cell, width: '56px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: theme.radius.full,
                        background: tt.color ?? theme.colors.primary,
                        border: theme.borders.light,
                        verticalAlign: 'middle',
                      }}
                      title={tt.color ?? '—'}
                    />
                  </td>

                  {/* Icon */}
                  <td style={{ ...tableStyles.cell, width: '56px', fontSize: '1.25rem', textAlign: 'center' }}>
                    {tt.icon || <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeSm }}>—</span>}
                  </td>

                  {/* Prefix */}
                  <td style={{ ...tableStyles.cell, width: '120px' }}>
                    <code
                      style={{
                        fontFamily: 'monospace',
                        fontSize: theme.font.sizeXs,
                        background: theme.colors.background,
                        border: theme.borders.light,
                        borderRadius: theme.radius.sm,
                        padding: '0.125rem 0.375rem',
                        color: theme.colors.textSecondary,
                      }}
                    >
                      {tt.prefix}
                    </code>
                  </td>

                  {/* Name */}
                  <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                    {tt.name}
                  </td>

                  {/* Description */}
                  <td style={{ ...tableStyles.cellMuted, maxWidth: '240px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {tt.description || <span style={{ color: theme.colors.textLight }}>—</span>}
                    </span>
                  </td>

                  {/* Active toggle */}
                  <td style={{ ...tableStyles.cell }}>
                    <button
                      onClick={() => handleToggleTaskTypeActive(tt)}
                      disabled={updateTaskType.isPending}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: theme.radius.full,
                        border: 'none',
                        fontSize: theme.font.sizeXs,
                        fontWeight: theme.font.weightSemibold,
                        cursor: 'pointer',
                        background: tt.isActive ? theme.colors.successLight : theme.colors.dangerLight,
                        color: tt.isActive ? '#065f46' : '#991b1b',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tt.isActive ? '✓ Actif' : '✗ Inactif'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
                    {deleteTaskTypeConfirmId === tt.id ? (
                      <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>Confirmer ?</span>
                        <button onClick={() => handleDeleteTaskType(tt.id)} disabled={deleteTaskType.isPending} style={{ ...buttonStyles.danger, ...buttonStyles.sm }}>
                          Oui
                        </button>
                        <button onClick={() => setDeleteTaskTypeConfirmId(null)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
                          Non
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => setEditingTaskType(tt)}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                        >
                          ✏️ Modifier
                        </button>
                        <button
                          onClick={() => setDeleteTaskTypeConfirmId(tt.id)}
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
        )}
      </div>

      {/* ── Section: Types de clients ────────────────────────────────────────── */}
      <ConfigTypeTable
        sectionIcon="👤"
        title="Types de clients"
        subtitle="Catégories de clients utilisées dans les fiches client et bons de travail"
        items={clientTypes}
        isLoading={ctLoading}
        isError={ctError}
        onCreate={() => setShowCreateClientTypeModal(true)}
        onEdit={(item) => setEditingClientType(item)}
        onToggleActive={handleToggleClientTypeActive}
        onDelete={handleDeleteClientType}
        isUpdating={updateClientType.isPending}
        isDeleting={deleteClientType.isPending}
      />

      {/* ── Section: Types d'emplacement ─────────────────────────────────────── */}
      <ConfigTypeTable
        sectionIcon="📍"
        title="Types d'emplacement"
        subtitle="Catégories d'adresses utilisées dans les fiches client et bons de travail"
        items={addressTypes}
        isLoading={atLoading}
        isError={atError}
        onCreate={() => setShowCreateAddressTypeModal(true)}
        onEdit={(item) => setEditingAddressType(item)}
        onCustomFields={(item) => setManagingFieldsForType(item)}
        onToggleActive={handleToggleAddressTypeActive}
        onDelete={handleDeleteAddressType}
        isUpdating={updateAddressType.isPending}
        isDeleting={deleteAddressType.isPending}
      />

      {managingFieldsForType && (
        <AddressTypeFieldsModal
          config={managingFieldsForType}
          onClose={() => setManagingFieldsForType(null)}
        />
      )}

      {/* ── TaskType Modals ─────────────────────────────────────────────────── */}
      {showCreateTaskTypeModal && (
        <TaskTypeModal
          title="Nouveau type de tâche"
          onSubmit={handleCreateTaskType}
          onCancel={() => { setShowCreateTaskTypeModal(false); createTaskType.reset(); }}
          isLoading={createTaskType.isPending}
          isError={createTaskType.isError}
          errorMessage={extractApiErrorMessage(createTaskType.error)}
        />
      )}

      {editingTaskType && (
        <TaskTypeModal
          title={`Modifier — ${editingTaskType.name}`}
          defaultValues={{
            prefix: editingTaskType.prefix ?? '',
            name: editingTaskType.name,
            description: editingTaskType.description ?? '',
            color: editingTaskType.color ?? '#3b82f6',
            icon: editingTaskType.icon ?? '',
            templateId: editingTaskType.templateId ?? '',
            processDefinitionId: editingTaskType.processDefinitionId ?? '',
          }}
          onSubmit={handleUpdateTaskType}
          onCancel={() => setEditingTaskType(null)}
          isLoading={updateTaskType.isPending}
          isError={updateTaskType.isError}
          errorMessage={extractApiErrorMessage(updateTaskType.error)}
        />
      )}

      {/* ── ClientType Modals ───────────────────────────────────────────────── */}
      {showCreateClientTypeModal && (
        <ConfigTypeModal
          title="Nouveau type de client"
          onSubmit={handleCreateClientType}
          onCancel={() => { setShowCreateClientTypeModal(false); createClientType.reset(); }}
          isLoading={createClientType.isPending}
          isError={createClientType.isError}
        />
      )}

      {editingClientType && (
        <ConfigTypeModal
          title={`Modifier — ${editingClientType.name}`}
          defaultValues={{
            name: editingClientType.name,
            code: editingClientType.code,
            description: editingClientType.description ?? '',
            color: editingClientType.color ?? '#3b82f6',
            icon: editingClientType.icon ?? '',
            sortOrder: String(editingClientType.sortOrder),
          }}
          onSubmit={handleUpdateClientType}
          onCancel={() => setEditingClientType(null)}
          isLoading={updateClientType.isPending}
          isError={updateClientType.isError}
        />
      )}

      {/* ── AddressType Modals ──────────────────────────────────────────────── */}
      {showCreateAddressTypeModal && (
        <ConfigTypeModal
          title="Nouveau type d'emplacement"
          onSubmit={handleCreateAddressType}
          onCancel={() => { setShowCreateAddressTypeModal(false); createAddressType.reset(); }}
          isLoading={createAddressType.isPending}
          isError={createAddressType.isError}
        />
      )}

      {editingAddressType && (
        <ConfigTypeModal
          title={`Modifier — ${editingAddressType.name}`}
          defaultValues={{
            name: editingAddressType.name,
            code: editingAddressType.code,
            description: editingAddressType.description ?? '',
            color: editingAddressType.color ?? '#3b82f6',
            icon: editingAddressType.icon ?? '',
            sortOrder: String(editingAddressType.sortOrder),
          }}
          onSubmit={handleUpdateAddressType}
          onCancel={() => setEditingAddressType(null)}
          isLoading={updateAddressType.isPending}
          isError={updateAddressType.isError}
        />
      )}
    </div>
  );
}
