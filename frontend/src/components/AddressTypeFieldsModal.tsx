import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { TemplateFieldType } from '../types';
import type { AddressTypeConfig, AddressTypeConfigField } from '../types';
import {
  useAddAddressTypeField,
  useUpdateAddressTypeField,
  useDeleteAddressTypeField,
  useUpdateAddressType,
} from '../hooks/useSettings';
import { theme, buttonStyles, formStyles, modalStyles } from '../theme';

interface Props {
  config: AddressTypeConfig;
  onClose: () => void;
}

const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  [TemplateFieldType.TEXT]: 'Texte court',
  [TemplateFieldType.TEXTAREA]: 'Texte long',
  [TemplateFieldType.EMAIL]: 'Email',
  [TemplateFieldType.URL]: 'URL',
  [TemplateFieldType.NUMBER]: 'Nombre',
  [TemplateFieldType.INTEGER]: 'Entier',
  [TemplateFieldType.FLOAT]: 'Décimal',
  [TemplateFieldType.CURRENCY]: 'Montant',
  [TemplateFieldType.PERCENTAGE]: 'Pourcentage',
  [TemplateFieldType.CHECKBOX]: 'Case à cocher',
  [TemplateFieldType.SELECT]: 'Liste déroulante',
  [TemplateFieldType.MULTISELECT]: 'Choix multiples',
  [TemplateFieldType.RADIO]: 'Boutons radio',
  [TemplateFieldType.DATE]: 'Date',
  [TemplateFieldType.TIME]: 'Heure',
  [TemplateFieldType.DATETIME]: 'Date et heure',
  [TemplateFieldType.PHONE]: 'Téléphone',
  [TemplateFieldType.PHONE_NA]: 'Téléphone NPA-NXX-XXXX',
  [TemplateFieldType.POSTAL_CODE_CA]: 'Code postal CA',
  [TemplateFieldType.GPS]: 'GPS',
};

const TYPES_WITH_OPTIONS = new Set<TemplateFieldType>([
  TemplateFieldType.SELECT,
  TemplateFieldType.MULTISELECT,
  TemplateFieldType.RADIO,
]);

export default function AddressTypeFieldsModal({ config, onClose }: Props) {
  const { t } = useTranslation();
  const fields = config.fields ?? [];
  const addField = useAddAddressTypeField();
  const updateField = useUpdateAddressTypeField();
  const deleteField = useDeleteAddressTypeField();
  const updateType = useUpdateAddressType();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '640px' }}>
        <div style={{ ...modalStyles.header }}>
          <div>
            <h2 style={{ ...modalStyles.headerTitle, margin: 0 }}>🔧 {t('settings:addressTypeFields.title', { defaultValue: 'Champs personnalisés' })}</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
              {t('settings:addressTypeFields.locationTypeLabel', { defaultValue: "Type d'emplacement :" })} <strong>{config.name}</strong> ({config.code})
            </p>
          </div>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <div style={{ ...modalStyles.body }}>
          {fields.length === 0 ? (
            <p style={{ color: theme.colors.textMuted, fontStyle: 'italic', margin: 0 }}>
              {t('settings:addressTypeFields.empty', { defaultValue: 'Aucun champ personnalisé pour ce type. Ajoutez-en un ci-dessous.' })}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {fields.map((f) => editingId === f.id ? (
                <FieldFormBlock
                  key={f.id}
                  initial={f}
                  isPending={updateField.isPending}
                  onSubmit={async (payload) => {
                    await updateField.mutateAsync({ typeId: config.id, fieldId: f.id, data: payload });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <FieldRow
                  key={f.id}
                  field={f}
                  isPredominant={config.predominantFieldId === f.id}
                  onEdit={() => setEditingId(f.id)}
                  onDelete={async () => {
                    if (!confirm(t('settings:addressTypeFields.deleteConfirm', { defaultValue: 'Supprimer le champ « {{label}} » ?', label: f.label }))) return;
                    await deleteField.mutateAsync({ typeId: config.id, fieldId: f.id });
                  }}
                  onSetPredominant={async () => {
                    await updateType.mutateAsync({
                      id: config.id,
                      data: { predominantFieldId: f.id },
                    });
                  }}
                  onUnsetPredominant={async () => {
                    await updateType.mutateAsync({
                      id: config.id,
                      data: { predominantFieldId: null },
                    });
                  }}
                />
              ))}
            </div>
          )}

          {showAdd ? (
            <FieldFormBlock
              isPending={addField.isPending}
              onSubmit={async (payload) => {
                await addField.mutateAsync({ typeId: config.id, data: payload });
                setShowAdd(false);
              }}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
            >
              {t('settings:addressTypeFields.addFieldButton', { defaultValue: '+ Ajouter un champ' })}
            </button>
          )}

          <p style={{ marginTop: '1rem', padding: '0.625rem 0.875rem', background: theme.colors.surfaceAlt, border: theme.borders.light, borderRadius: theme.radius.md, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            ⭐ <strong>{t('settings:addressTypeFields.predominantStrong', { defaultValue: 'Champ prédominant' })}</strong>{t('settings:addressTypeFields.predominantDesc', { defaultValue: " : la valeur de ce champ est affichée en gros à la place de la rue, pour les adresses de ce type. Utile pour un n° de terrain (camping), un n° d'unité (entrepôt), etc." })}
          </p>
        </div>

        <div style={{ ...modalStyles.footer }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyles.secondary }}>{t('common:actions.close', { defaultValue: 'Fermer' })}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: existing field row ───────────────────────────────────────

function FieldRow({
  field,
  isPredominant,
  onEdit,
  onDelete,
  onSetPredominant,
  onUnsetPredominant,
}: {
  field: AddressTypeConfigField;
  isPredominant: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetPredominant: () => void;
  onUnsetPredominant: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      background: theme.colors.surfaceAlt,
      border: isPredominant ? `2px solid ${theme.colors.primary}` : theme.borders.light,
      borderRadius: theme.radius.md,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, color: theme.colors.text }}>
            {field.label}
          </span>
          {field.required && <span style={{ color: theme.colors.danger, marginLeft: '0.2rem' }}>*</span>}
          <span style={{ marginLeft: '0.5rem', fontSize: theme.font.sizeXs, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: theme.colors.primaryLight, color: theme.colors.primary }}>
            {t('settings:addressTypeFields.fieldType_' + field.fieldType, { defaultValue: FIELD_TYPE_LABELS[field.fieldType] })}
          </span>
          {isPredominant && (
            <span style={{ marginLeft: '0.4rem', fontSize: theme.font.sizeXs, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: theme.colors.primary, color: '#fff', fontWeight: theme.font.weightSemibold }}>
              {t('settings:addressTypeFields.predominantBadge', { defaultValue: '⭐ Prédominant' })}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {isPredominant ? (
          <button onClick={onUnsetPredominant} title={t('settings:addressTypeFields.unsetPredominantTitle', { defaultValue: 'Retirer le rôle prédominant' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>☆</button>
        ) : (
          <button onClick={onSetPredominant} title={t('settings:addressTypeFields.setPredominantTitle', { defaultValue: 'Définir comme prédominant' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>⭐</button>
        )}
        <button onClick={onEdit} title={t('settings:addressTypeFields.editTitle', { defaultValue: 'Modifier' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem' }}>✏️</button>
        <button onClick={onDelete} title={t('settings:addressTypeFields.deleteTitle', { defaultValue: 'Supprimer' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem', color: theme.colors.danger }}>🗑</button>
      </div>
    </div>
  );
}

// ─── Sub-component: form block (add or edit) ────────────────────────────────

function FieldFormBlock({
  initial,
  isPending,
  onSubmit,
  onCancel,
}: {
  initial?: AddressTypeConfigField;
  isPending: boolean;
  onSubmit: (payload: {
    label: string;
    labelFr: string;
    labelEn: string;
    fieldType: TemplateFieldType;
    required: boolean;
    options?: string[];
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('settings');
  const [labelFr, setLabelFr] = useState(initial?.labelFr ?? initial?.label ?? '');
  const [labelEn, setLabelEn] = useState(initial?.labelEn ?? initial?.label ?? '');
  const [fieldType, setFieldType] = useState<TemplateFieldType>(initial?.fieldType ?? TemplateFieldType.TEXT);
  const [required, setRequired] = useState(initial?.required ?? false);
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join('\n'));

  async function handleSubmit() {
    const fr = labelFr.trim();
    const en = labelEn.trim();
    if (!fr && !en) return;
    const payload: { label: string; labelFr: string; labelEn: string; fieldType: TemplateFieldType; required: boolean; options?: string[] } = {
      label: fr || en, // canonical (backend middleware will sync anyway)
      labelFr: fr,
      labelEn: en,
      fieldType,
      required,
    };
    if (TYPES_WITH_OPTIONS.has(fieldType)) {
      payload.options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    await onSubmit(payload);
  }

  return (
    <div style={{ padding: '0.75rem', background: theme.colors.primaryLight, border: `1px solid ${theme.colors.primary}40`, borderRadius: theme.radius.md, marginTop: '0.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <label style={{ ...formStyles.label }}>{t('settings:addressTypeFields.labelFrLabel', { defaultValue: 'Libellé FR' })}</label>
          <input
            value={labelFr}
            onChange={(e) => setLabelFr(e.target.value)}
            placeholder={t('settings:addressTypeFields.labelFrPlaceholder', { defaultValue: 'Ex: N° de terrain' })}
            style={{ ...formStyles.input, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('settings:addressTypeFields.labelEnLabel', { defaultValue: 'Libellé EN' })}</label>
          <input
            value={labelEn}
            onChange={(e) => setLabelEn(e.target.value)}
            placeholder={t('settings:addressTypeFields.labelEnPlaceholder', { defaultValue: 'Ex: Site number' })}
            style={{ ...formStyles.input, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>{t('settings:addressTypeFields.typeLabel', { defaultValue: 'Type' })}</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as TemplateFieldType)}
            style={{ ...formStyles.select, boxSizing: 'border-box' }}
          >
            {Object.values(TemplateFieldType).map((ft) => (
              <option key={ft} value={ft}>{t('settings:addressTypeFields.fieldType_' + ft, { defaultValue: FIELD_TYPE_LABELS[ft] })}</option>
            ))}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: theme.font.sizeSm, color: theme.colors.text, cursor: 'pointer', paddingBottom: '0.5rem' }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {t('settings:addressTypeFields.required', { defaultValue: 'Requis' })}
        </label>
      </div>
      {TYPES_WITH_OPTIONS.has(fieldType) && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ ...formStyles.label }}>{t('settings:addressTypeFields.optionsLabel', { defaultValue: 'Options (une par ligne)' })}</label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={3}
            style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
            placeholder={t('settings:addressTypeFields.optionsPlaceholder', { defaultValue: 'Option 1\nOption 2' })}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={(!labelFr.trim() && !labelEn.trim()) || isPending}
          style={{ ...buttonStyles.primary, ...buttonStyles.sm }}
        >
          {initial ? t('settings:addressTypeFields.save', { defaultValue: '✓ Enregistrer' }) : t('settings:addressTypeFields.add', { defaultValue: '✓ Ajouter' })}
        </button>
        <button type="button" onClick={onCancel} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
          {t('settings:addressTypeFields.cancel', { defaultValue: 'Annuler' })}
        </button>
      </div>
    </div>
  );
}
