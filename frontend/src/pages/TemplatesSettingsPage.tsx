import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useTemplates,
  useTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useUpdateTemplate,
  useAddSection,
  useUpdateSection,
  useDeleteSection,
  useAddField,
  useUpdateField,
  useDeleteField,
} from '../hooks/useTemplates';
import { TemplateFieldType, Role } from '../types';
import type { TemplateField, TemplateSection } from '../types';

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.DISPATCHER]: 'Dispatcher',
  [Role.TECHNICIAN]: 'Technicien',
};

const ALL_ROLES: Role[] = [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN];

/** Tristate role matrix: view + edit (+ optional required for fields). */
function PermissionsMatrix({
  viewRoles,
  editRoles,
  requiredRoles,
  onChange,
  showRequired,
}: {
  viewRoles: Role[];
  editRoles: Role[];
  requiredRoles?: Role[];
  onChange: (next: { viewRoles: Role[]; editRoles: Role[]; requiredRoles?: Role[] }) => void;
  showRequired: boolean;
}) {
  function toggle(list: Role[], role: Role, on: boolean): Role[] {
    if (role === Role.ADMIN) return list; // admin always implicitly in
    const without = list.filter((r) => r !== role);
    return on ? [...without, role] : without;
  }

  function handleView(role: Role, on: boolean) {
    const nextView = toggle(viewRoles, role, on);
    // Coherence: can't edit/require what you can't see → drop those flags too
    const nextEdit = on ? editRoles : toggle(editRoles, role, false);
    const nextRequired = on ? requiredRoles : toggle(requiredRoles ?? [], role, false);
    onChange({ viewRoles: nextView, editRoles: nextEdit, requiredRoles: showRequired ? nextRequired : undefined });
  }
  function handleEdit(role: Role, on: boolean) {
    const nextEdit = toggle(editRoles, role, on);
    onChange({ viewRoles, editRoles: nextEdit, requiredRoles });
  }
  function handleRequired(role: Role, on: boolean) {
    const nextRequired = toggle(requiredRoles ?? [], role, on);
    onChange({ viewRoles, editRoles, requiredRoles: nextRequired });
  }

  return (
    <div style={{ background: theme.colors.surface, border: theme.borders.light, borderRadius: theme.radius.sm, padding: '0.5rem 0.75rem', marginTop: '0.5rem' }}>
      <p style={{ margin: '0 0 0.375rem', fontSize: theme.font.sizeXs, fontWeight: theme.font.weightSemibold, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        🔒 Permissions par rôle
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.font.sizeXs }}>
        <thead>
          <tr style={{ color: theme.colors.textMuted }}>
            <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: theme.font.weightMedium }}>Rôle</th>
            <th style={{ padding: '0.2rem 0.4rem', fontWeight: theme.font.weightMedium }}>Voir</th>
            <th style={{ padding: '0.2rem 0.4rem', fontWeight: theme.font.weightMedium }}>Modifier</th>
            {showRequired && (
              <th style={{ padding: '0.2rem 0.4rem', fontWeight: theme.font.weightMedium }}>Requis</th>
            )}
          </tr>
        </thead>
        <tbody>
          {ALL_ROLES.map((r) => {
            const isAdmin = r === Role.ADMIN;
            const canView = isAdmin || viewRoles.includes(r);
            const canEdit = isAdmin || editRoles.includes(r);
            const isRequired = (requiredRoles ?? []).includes(r);
            return (
              <tr key={r}>
                <td style={{ padding: '0.2rem 0.4rem', color: theme.colors.text }}>
                  {ROLE_LABELS[r]}{isAdmin && <span style={{ color: theme.colors.textMuted, marginLeft: '0.25rem' }}>(bypass)</span>}
                </td>
                <td style={{ padding: '0.2rem 0.4rem', textAlign: 'center' }}>
                  <input type="checkbox" checked={canView} disabled={isAdmin} onChange={(e) => handleView(r, e.target.checked)} />
                </td>
                <td style={{ padding: '0.2rem 0.4rem', textAlign: 'center' }}>
                  <input type="checkbox" checked={canEdit} disabled={isAdmin || !canView} onChange={(e) => handleEdit(r, e.target.checked)} />
                </td>
                {showRequired && (
                  <td style={{ padding: '0.2rem 0.4rem', textAlign: 'center' }}>
                    <input type="checkbox" checked={isRequired} disabled={isAdmin || !canView} onChange={(e) => handleRequired(r, e.target.checked)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
import LoadingSpinner from '../components/LoadingSpinner';
import {
  theme,
  buttonStyles,
  formStyles,
  layoutStyles,
  cardStyles,
} from '../theme';

const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  // Texte
  [TemplateFieldType.TEXT]: 'Texte court',
  [TemplateFieldType.TEXTAREA]: 'Texte long',
  [TemplateFieldType.EMAIL]: 'Email',
  [TemplateFieldType.URL]: 'URL / lien',
  // Numérique
  [TemplateFieldType.NUMBER]: 'Nombre (générique)',
  [TemplateFieldType.INTEGER]: 'Entier',
  [TemplateFieldType.FLOAT]: 'Décimal',
  [TemplateFieldType.CURRENCY]: 'Montant ($ CAD)',
  [TemplateFieldType.PERCENTAGE]: 'Pourcentage (%)',
  // Sélection
  [TemplateFieldType.CHECKBOX]: 'Case à cocher',
  [TemplateFieldType.SELECT]: 'Liste déroulante',
  [TemplateFieldType.MULTISELECT]: 'Choix multiples',
  [TemplateFieldType.RADIO]: 'Boutons radio',
  // Date / heure
  [TemplateFieldType.DATE]: 'Date',
  [TemplateFieldType.TIME]: 'Heure',
  [TemplateFieldType.DATETIME]: 'Date et heure',
  // Téléphone / code postal
  [TemplateFieldType.PHONE]: 'Téléphone (libre)',
  [TemplateFieldType.PHONE_NA]: 'Téléphone NPA-NXX-XXXX',
  [TemplateFieldType.POSTAL_CODE_CA]: 'Code postal CA (A1A 1A1)',
  // Géolocalisation
  [TemplateFieldType.GPS]: 'Coordonnées GPS',
};

/** Groupes ordonnés pour le `<select>` du type de champ dans le builder. */
const FIELD_TYPE_GROUPS: Array<{ label: string; types: TemplateFieldType[] }> = [
  { label: 'Texte', types: [TemplateFieldType.TEXT, TemplateFieldType.TEXTAREA, TemplateFieldType.EMAIL, TemplateFieldType.URL] },
  { label: 'Numérique', types: [TemplateFieldType.INTEGER, TemplateFieldType.FLOAT, TemplateFieldType.NUMBER, TemplateFieldType.CURRENCY, TemplateFieldType.PERCENTAGE] },
  { label: 'Date / Heure', types: [TemplateFieldType.DATE, TemplateFieldType.TIME, TemplateFieldType.DATETIME] },
  { label: 'Sélection', types: [TemplateFieldType.CHECKBOX, TemplateFieldType.SELECT, TemplateFieldType.MULTISELECT, TemplateFieldType.RADIO] },
  { label: 'Téléphone / Code postal', types: [TemplateFieldType.PHONE, TemplateFieldType.PHONE_NA, TemplateFieldType.POSTAL_CODE_CA] },
  { label: 'Géolocalisation', types: [TemplateFieldType.GPS] },
];

/** Field types that use the free-form `options` (one per line) input in the builder. */
const TYPES_WITH_OPTIONS = new Set<TemplateFieldType>([
  TemplateFieldType.SELECT,
  TemplateFieldType.MULTISELECT,
  TemplateFieldType.RADIO,
]);

export default function TemplatesSettingsPage() {
  const { t } = useTranslation('settings');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  return (
    <div style={{ ...layoutStyles.page }}>
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>{t('templates.title')}</h1>
          <p style={{ ...layoutStyles.pageSubtitle }}>
            {t('templates.subtitle', { defaultValue: 'Définissez des sections et des champs personnalisés pour chaque type de tâche.' })}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        <TemplateList
          activeId={activeTemplateId}
          onSelect={setActiveTemplateId}
        />
        {activeTemplateId ? (
          <TemplateBuilder templateId={activeTemplateId} />
        ) : (
          <div style={{ ...cardStyles.card, color: theme.colors.textMuted, padding: '2rem', textAlign: 'center' }}>
            Sélectionnez un template à gauche ou créez-en un nouveau.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Template List ─────────────────────────────────────────────────────────

function TemplateList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: templates = [], isLoading } = useTemplates(true);
  const createTpl = useCreateTemplate();
  const delTpl = useDeleteTemplate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      const tpl = await createTpl.mutateAsync({ name: newName.trim() });
      setNewName('');
      setShowCreate(false);
      onSelect((tpl as { id: string }).id);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setCreateError(axiosErr?.response?.data?.message ?? 'Erreur lors de la création.');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce template ? Les types de tâche associés perdront leur lien.')) return;
    await delTpl.mutateAsync(id);
    if (id === activeId) onSelect('');
  }

  return (
    <div style={{ ...cardStyles.card, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: theme.font.sizeMd, color: theme.colors.text }}>Templates</h3>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>
            + Nouveau
          </button>
        )}
      </div>

      {showCreate && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.md }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du template"
            style={{ ...formStyles.input, boxSizing: 'border-box', marginBottom: '0.5rem' }}
            autoFocus
          />
          {createError && (
            <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeXs, margin: '0 0 0.5rem' }}>{createError}</p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleCreate} disabled={!newName.trim() || createTpl.isPending} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>
              {createTpl.isPending ? '...' : '✓ Créer'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(''); setCreateError(null); }} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : templates.length === 0 ? (
        <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, fontStyle: 'italic' }}>
          Aucun template pour l'instant.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                background: t.id === activeId ? theme.colors.primaryLight : 'transparent',
                border: t.id === activeId ? `1px solid ${theme.colors.primary}` : theme.borders.light,
                borderRadius: theme.radius.md,
                cursor: 'pointer',
              }}
              onClick={() => onSelect(t.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, color: theme.colors.text }}>
                  {t.name}
                  {!t.isActive && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: theme.colors.danger, fontStyle: 'italic' }}>(inactif)</span>}
                </p>
                <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                  {t._count?.sections ?? 0} section{(t._count?.sections ?? 0) !== 1 ? 's' : ''}
                  {(t._count?.taskTypes ?? 0) > 0 && ` · utilisé par ${t._count!.taskTypes} type${t._count!.taskTypes > 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                title="Supprimer"
                style={{ background: 'none', border: 'none', color: theme.colors.danger, cursor: 'pointer', fontSize: '0.95rem', padding: '0.25rem 0.5rem' }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Template Builder (sections + fields) ──────────────────────────────────

function TemplateBuilder({ templateId }: { templateId: string }) {
  const { data: tpl, isLoading } = useTemplate(templateId);
  const updateTpl = useUpdateTemplate();
  const addSection = useAddSection();

  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editing, setEditing] = useState(false);
  const [newSection, setNewSection] = useState('');

  // Sync local state when template loads/changes
  function startEditing() {
    if (!tpl) return;
    setEditName(tpl.name);
    setEditDesc(tpl.description ?? '');
    setEditing(true);
  }

  async function handleSaveMeta() {
    if (!editName.trim()) return;
    await updateTpl.mutateAsync({
      id: templateId,
      data: { name: editName.trim(), description: editDesc.trim() || undefined },
    });
    setEditing(false);
  }

  async function handleAddSection() {
    if (!newSection.trim()) return;
    await addSection.mutateAsync({ templateId, data: { name: newSection.trim() } });
    setNewSection('');
  }

  if (isLoading) return <LoadingSpinner />;
  if (!tpl) return <p style={{ color: theme.colors.danger }}>Template introuvable.</p>;

  return (
    <div style={{ ...cardStyles.card, padding: '1.25rem' }}>
      {/* Template meta */}
      {!editing ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: theme.font.sizeXl, color: theme.colors.text }}>{tpl.name}</h2>
            {tpl.description && <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{tpl.description}</p>}
          </div>
          <button onClick={startEditing} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>✏️ Renommer</button>
        </div>
      ) : (
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.md }}>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Nom"
            style={{ ...formStyles.input, boxSizing: 'border-box', marginBottom: '0.5rem' }}
          />
          <input
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Description (optionnel)"
            style={{ ...formStyles.input, boxSizing: 'border-box', marginBottom: '0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSaveMeta} disabled={updateTpl.isPending} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>
              ✓ Enregistrer
            </button>
            <button onClick={() => setEditing(false)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
        {tpl.sections.length === 0 ? (
          <p style={{ color: theme.colors.textMuted, fontStyle: 'italic', fontSize: theme.font.sizeSm }}>
            Aucune section. Ajoutez-en une ci-dessous.
          </p>
        ) : (
          tpl.sections.map((sec) => (
            <SectionEditor key={sec.id} templateId={templateId} section={sec} />
          ))
        )}
      </div>

      {/* Add section */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          placeholder="Nom de la nouvelle section (ex: Avant intervention)"
          style={{ ...formStyles.input, boxSizing: 'border-box', flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); } }}
        />
        <button onClick={handleAddSection} disabled={!newSection.trim() || addSection.isPending} style={{ ...buttonStyles.primary }}>
          + Ajouter une section
        </button>
      </div>
    </div>
  );
}

// ─── Section Editor ─────────────────────────────────────────────────────────

function SectionEditor({ templateId, section }: { templateId: string; section: TemplateSection }) {
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const addField = useAddField();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(section.name);
  const [showAddField, setShowAddField] = useState(false);
  const [showPerms, setShowPerms] = useState(false);

  async function handleRename() {
    if (!name.trim()) return;
    await updateSection.mutateAsync({ templateId, sectionId: section.id, data: { name: name.trim() } });
    setEditingName(false);
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la section « ${section.name} » et tous ses champs ?`)) return;
    await deleteSection.mutateAsync({ templateId, sectionId: section.id });
  }

  async function handlePermsChange(next: { viewRoles: Role[]; editRoles: Role[] }) {
    await updateSection.mutateAsync({
      templateId,
      sectionId: section.id,
      data: { viewRoles: next.viewRoles, editRoles: next.editRoles },
    });
  }

  return (
    <div
      style={{
        border: theme.borders.default,
        borderRadius: theme.radius.md,
        background: theme.colors.surface,
        padding: '0.75rem 1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        {editingName ? (
          <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...formStyles.input, boxSizing: 'border-box', flex: 1 }}
              autoFocus
            />
            <button onClick={handleRename} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>✓</button>
            <button onClick={() => { setEditingName(false); setName(section.name); }} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>✕</button>
          </div>
        ) : (
          <>
            <h4 style={{ margin: 0, fontSize: theme.font.sizeMd, color: theme.colors.text }}>📂 {section.name}</h4>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={() => setShowPerms((v) => !v)} title="Permissions par rôle" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}>🔒</button>
              <button onClick={() => setEditingName(true)} title="Renommer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}>✏️</button>
              <button onClick={handleDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.9rem', color: theme.colors.danger }}>🗑</button>
            </div>
          </>
        )}
      </div>

      {showPerms && (
        <PermissionsMatrix
          viewRoles={section.viewRoles}
          editRoles={section.editRoles}
          showRequired={false}
          onChange={(next) => handlePermsChange({ viewRoles: next.viewRoles, editRoles: next.editRoles })}
        />
      )}

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.5rem' }}>
        {section.fields.length === 0 ? (
          <p style={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.font.sizeXs, fontStyle: 'italic' }}>
            Aucun champ dans cette section.
          </p>
        ) : (
          section.fields.map((f) => (
            <FieldRow key={f.id} templateId={templateId} sectionId={section.id} field={f} />
          ))
        )}
      </div>

      {/* Add field */}
      {!showAddField ? (
        <button onClick={() => setShowAddField(true)} style={{ ...buttonStyles.ghost, ...buttonStyles.sm, color: theme.colors.primary, padding: '0.25rem 0.5rem' }}>
          + Ajouter un champ
        </button>
      ) : (
        <AddFieldForm
          templateId={templateId}
          sectionId={section.id}
          onDone={() => setShowAddField(false)}
          isPending={addField.isPending}
        />
      )}
    </div>
  );
}

// ─── Field Row ──────────────────────────────────────────────────────────────

function FieldRow({
  templateId,
  sectionId,
  field,
}: {
  templateId: string;
  sectionId: string;
  field: TemplateField;
}) {
  const updateField = useUpdateField();
  const deleteField = useDeleteField();
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!confirm(`Supprimer le champ « ${field.label} » ?`)) return;
    await deleteField.mutateAsync({ templateId, sectionId, fieldId: field.id });
  }

  if (editing) {
    return (
      <EditFieldForm
        templateId={templateId}
        sectionId={sectionId}
        field={field}
        onDone={() => setEditing(false)}
        isPending={updateField.isPending}
      />
    );
  }

  const isRequiredForAll = ALL_ROLES.every((r) => r === Role.ADMIN || field.requiredRoles.includes(r));
  const requiredForSome = !isRequiredForAll && field.requiredRoles.length > 0;
  const hiddenForSome = ALL_ROLES.some((r) => r !== Role.ADMIN && !field.viewRoles.includes(r));
  const readonlyForSome = ALL_ROLES.some((r) => r !== Role.ADMIN && field.viewRoles.includes(r) && !field.editRoles.includes(r));

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: theme.colors.surfaceAlt, borderRadius: theme.radius.sm, border: theme.borders.light }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text }}>
          {field.label}
          {isRequiredForAll && <span style={{ color: theme.colors.danger, marginLeft: '0.25rem' }} title="Requis pour tous les rôles">*</span>}
          {requiredForSome && <span style={{ color: theme.colors.warning ?? '#b45309', marginLeft: '0.25rem' }} title={`Requis pour : ${field.requiredRoles.map((r) => ROLE_LABELS[r]).join(', ')}`}>*</span>}
          {hiddenForSome && <span title="Masqué pour certains rôles" style={{ marginLeft: '0.35rem', fontSize: '0.7rem' }}>🙈</span>}
          {readonlyForSome && <span title="Lecture seule pour certains rôles" style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>🔒</span>}
        </span>
        <span style={{ marginLeft: '0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, padding: '0.1rem 0.4rem', background: theme.colors.primaryLight, borderRadius: theme.radius.full }}>
          {FIELD_TYPE_LABELS[field.fieldType]}
        </span>
        {field.options && field.options.length > 0 && (
          <span style={{ marginLeft: '0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, fontStyle: 'italic' }}>
            ({field.options.length} options)
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button onClick={() => setEditing(true)} title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.85rem' }}>✏️</button>
        <button onClick={handleDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.85rem', color: theme.colors.danger }}>🗑</button>
      </div>
    </div>
  );
}

// ─── Add / Edit Field Form ──────────────────────────────────────────────────

function AddFieldForm({
  templateId,
  sectionId,
  onDone,
  isPending,
}: {
  templateId: string;
  sectionId: string;
  onDone: () => void;
  isPending: boolean;
}) {
  const addField = useAddField();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<TemplateFieldType>(TemplateFieldType.TEXT);
  const [optionsText, setOptionsText] = useState('');
  const [viewRoles, setViewRoles] = useState<Role[]>([Role.DISPATCHER, Role.TECHNICIAN]);
  const [editRoles, setEditRoles] = useState<Role[]>([Role.DISPATCHER, Role.TECHNICIAN]);
  const [requiredRoles, setRequiredRoles] = useState<Role[]>([]);

  async function handleAdd() {
    if (!label.trim()) return;
    const payload: {
      label: string;
      fieldType: TemplateFieldType;
      options?: string[];
      viewRoles: Role[];
      editRoles: Role[];
      requiredRoles: Role[];
    } = {
      label: label.trim(),
      fieldType,
      viewRoles,
      editRoles,
      requiredRoles,
    };
    if (TYPES_WITH_OPTIONS.has(fieldType)) {
      payload.options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    await addField.mutateAsync({ templateId, sectionId, data: payload });
    onDone();
  }

  return (
    <div style={{ padding: '0.625rem', background: theme.colors.primaryLight, border: `1px solid ${theme.colors.primary}40`, borderRadius: theme.radius.sm, marginTop: '0.25rem' }}>
      <FieldFormFields
        label={label}
        setLabel={setLabel}
        fieldType={fieldType}
        setFieldType={setFieldType}
        optionsText={optionsText}
        setOptionsText={setOptionsText}
      />
      <PermissionsMatrix
        viewRoles={viewRoles}
        editRoles={editRoles}
        requiredRoles={requiredRoles}
        showRequired
        onChange={(next) => {
          setViewRoles(next.viewRoles);
          setEditRoles(next.editRoles);
          if (next.requiredRoles) setRequiredRoles(next.requiredRoles);
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button onClick={handleAdd} disabled={!label.trim() || isPending} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>
          ✓ Ajouter
        </button>
        <button onClick={onDone} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>Annuler</button>
      </div>
    </div>
  );
}

function EditFieldForm({
  templateId,
  sectionId,
  field,
  onDone,
  isPending,
}: {
  templateId: string;
  sectionId: string;
  field: TemplateField;
  onDone: () => void;
  isPending: boolean;
}) {
  const updateField = useUpdateField();
  const [label, setLabel] = useState(field.label);
  const [fieldType, setFieldType] = useState<TemplateFieldType>(field.fieldType);
  const [optionsText, setOptionsText] = useState((field.options ?? []).join('\n'));
  const [viewRoles, setViewRoles] = useState<Role[]>(field.viewRoles.filter((r) => r !== Role.ADMIN));
  const [editRoles, setEditRoles] = useState<Role[]>(field.editRoles.filter((r) => r !== Role.ADMIN));
  const [requiredRoles, setRequiredRoles] = useState<Role[]>(field.requiredRoles);

  async function handleSave() {
    if (!label.trim()) return;
    const payload: {
      label: string;
      fieldType: TemplateFieldType;
      options?: string[];
      viewRoles: Role[];
      editRoles: Role[];
      requiredRoles: Role[];
    } = {
      label: label.trim(),
      fieldType,
      viewRoles,
      editRoles,
      requiredRoles,
    };
    if (TYPES_WITH_OPTIONS.has(fieldType)) {
      payload.options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    await updateField.mutateAsync({ templateId, sectionId, fieldId: field.id, data: payload });
    onDone();
  }

  return (
    <div style={{ padding: '0.625rem', background: theme.colors.primaryLight, border: `1px solid ${theme.colors.primary}40`, borderRadius: theme.radius.sm }}>
      <FieldFormFields
        label={label}
        setLabel={setLabel}
        fieldType={fieldType}
        setFieldType={setFieldType}
        optionsText={optionsText}
        setOptionsText={setOptionsText}
      />
      <PermissionsMatrix
        viewRoles={viewRoles}
        editRoles={editRoles}
        requiredRoles={requiredRoles}
        showRequired
        onChange={(next) => {
          setViewRoles(next.viewRoles);
          setEditRoles(next.editRoles);
          if (next.requiredRoles) setRequiredRoles(next.requiredRoles);
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button onClick={handleSave} disabled={!label.trim() || isPending} style={{ ...buttonStyles.primary, ...buttonStyles.sm }}>
          ✓ Enregistrer
        </button>
        <button onClick={onDone} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>Annuler</button>
      </div>
    </div>
  );
}

function FieldFormFields({
  label,
  setLabel,
  fieldType,
  setFieldType,
  optionsText,
  setOptionsText,
}: {
  label: string;
  setLabel: (v: string) => void;
  fieldType: TemplateFieldType;
  setFieldType: (v: TemplateFieldType) => void;
  optionsText: string;
  setOptionsText: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <label style={{ ...formStyles.label }}>Libellé</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...formStyles.input, boxSizing: 'border-box' }} placeholder="Ex: Marque du chauffe-eau" />
        </div>
        <div>
          <label style={{ ...formStyles.label }}>Type</label>
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as TemplateFieldType)} style={{ ...formStyles.select, boxSizing: 'border-box' }}>
            {FIELD_TYPE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((t) => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      {TYPES_WITH_OPTIONS.has(fieldType) && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ ...formStyles.label }}>Options (une par ligne)</label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={3}
            style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
            placeholder={'Option 1\nOption 2\nOption 3'}
          />
        </div>
      )}
    </>
  );
}
