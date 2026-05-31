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
            <h2 style={{ ...modalStyles.headerTitle, margin: 0 }}>🔧 Champs personnalisés</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
              Type d'emplacement : <strong>{config.name}</strong> ({config.code})
            </p>
          </div>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>

        <div style={{ ...modalStyles.body }}>
          {fields.length === 0 ? (
            <p style={{ color: theme.colors.textMuted, fontStyle: 'italic', margin: 0 }}>
              Aucun champ personnalisé pour ce type. Ajoutez-en un ci-dessous.
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
                    if (!confirm(`Supprimer le champ « ${f.label} » ?`)) return;
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
              + Ajouter un champ
            </button>
          )}

          <p style={{ marginTop: '1rem', padding: '0.625rem 0.875rem', background: theme.colors.surfaceAlt, border: theme.borders.light, borderRadius: theme.radius.md, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            ⭐ <strong>Champ prédominant</strong> : la valeur de ce champ est affichée en gros à la place de la rue, pour les adresses de ce type. Utile pour un n° de terrain (camping), un n° d'unité (entrepôt), etc.
          </p>
        </div>

        <div style={{ ...modalStyles.footer }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyles.secondary }}>Fermer</button>
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
            {FIELD_TYPE_LABELS[field.fieldType]}
          </span>
          {isPredominant && (
            <span style={{ marginLeft: '0.4rem', fontSize: theme.font.sizeXs, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: theme.colors.primary, color: '#fff', fontWeight: theme.font.weightSemibold }}>
              ⭐ Prédominant
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {isPredominant ? (
          <button onClick={onUnsetPredominant} title="Retirer le rôle prédominant" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>☆</button>
        ) : (
          <button onClick={onSetPredominant} title="Définir comme prédominant" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>⭐</button>
        )}
        <button onClick={onEdit} title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem' }}>✏️</button>
        <button onClick={onDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem', color: theme.colors.danger }}>🗑</button>
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
    fieldType: TemplateFieldType;
    required: boolean;
    options?: string[];
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [fieldType, setFieldType] = useState<TemplateFieldType>(initial?.fieldType ?? TemplateFieldType.TEXT);
  const [required, setRequired] = useState(initial?.required ?? false);
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join('\n'));

  async function handleSubmit() {
    if (!label.trim()) return;
    const payload: { label: string; fieldType: TemplateFieldType; required: boolean; options?: string[] } = {
      label: label.trim(),
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <label style={{ ...formStyles.label }}>Libellé</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: N° de terrain"
            style={{ ...formStyles.input, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as TemplateFieldType)}
            style={{ ...formStyles.select, boxSizing: 'border-box' }}
          >
            {Object.values(TemplateFieldType).map((t) => (
              <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: theme.font.sizeSm, color: theme.colors.text, cursor: 'pointer', paddingBottom: '0.5rem' }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Requis
        </label>
      </div>
      {TYPES_WITH_OPTIONS.has(fieldType) && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ ...formStyles.label }}>Options (une par ligne)</label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={3}
            style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
            placeholder={'Option 1\nOption 2'}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!label.trim() || isPending}
          style={{ ...buttonStyles.primary, ...buttonStyles.sm }}
        >
          {initial ? '✓ Enregistrer' : '✓ Ajouter'}
        </button>
        <button type="button" onClick={onCancel} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
