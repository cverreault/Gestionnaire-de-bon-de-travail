import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { adminResetPassword } from '../services/users.service';
import LoadingSpinner from '../components/LoadingSpinner';
import { Role } from '../types';
import type { User, ApiResponse } from '../types';
import { theme, tableStyles, cardStyles, buttonStyles, formStyles, modalStyles, layoutStyles, getRowStyle } from '../theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super-Admin',
  [Role.ADMIN]: 'Admin',
  [Role.DISPATCHER]: 'Dispatcher',
  [Role.TECHNICIAN]: 'Technicien',
};

const ROLE_COLORS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: '#7e22ce',
  [Role.ADMIN]: '#1e40af',
  [Role.DISPATCHER]: '#7c3aed',
  [Role.TECHNICIAN]: '#065f46',
};

// ─── Form field helper ────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  children?: React.ReactNode; // for select
}

function Field({ label, id, type = 'text', value, onChange, required, placeholder, children }: FieldProps) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label
        htmlFor={id}
        style={{ ...formStyles.label }}
      >
        {label} {required && <span style={{ color: theme.colors.danger }}>*</span>}
      </label>
      {children ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          style={{ ...formStyles.select }}
        >
          {children}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          style={{ ...formStyles.input }}
        />
      )}
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

interface CreateUserModalProps {
  onClose: () => void;
}

function CreateUserModal({ onClose }: CreateUserModalProps) {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<Role>(Role.TECHNICIAN);
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const createUser = useMutation({
    mutationFn: async (dto: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: string;
      phone?: string;
    }) => {
      const { data } = await api.post<ApiResponse<User>>('/users', dto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        axiosErr?.response?.data?.message ?? 'Une erreur est survenue. Veuillez réessayer.',
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    createUser.mutate({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '480px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>
            Nouvel utilisateur
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: theme.colors.textLight,
              lineHeight: 1,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ ...modalStyles.body }}>
          {errorMsg && (
            <div
              style={{
                background: theme.colors.dangerLight,
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: theme.radius.md,
                fontSize: theme.font.sizeSm,
                marginBottom: '1rem',
                border: '1px solid #fca5a5',
              }}
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Field
                label="Prénom"
                id="create-firstName"
                value={firstName}
                onChange={setFirstName}
                required
                placeholder="Jean"
              />
              <Field
                label="Nom"
                id="create-lastName"
                value={lastName}
                onChange={setLastName}
                required
                placeholder="Dupont"
              />
            </div>

            <Field
              label="Email"
              id="create-email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              placeholder="jean.dupont@example.com"
            />

            <Field
              label="Mot de passe"
              id="create-password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              placeholder="••••••••"
            />

            <Field label="Rôle" id="create-role" value={role} onChange={(v) => setRole(v as Role)} required>
              <option value={Role.TECHNICIAN}>Technicien</option>
              <option value={Role.DISPATCHER}>Répartiteur</option>
              <option value={Role.ADMIN}>Admin</option>
            </Field>

            <Field
              label="Téléphone"
              id="create-phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="+33 6 12 34 56 78"
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ ...buttonStyles.secondary, flex: 1 }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={createUser.isPending}
                style={{
                  ...buttonStyles.primary,
                  flex: 1,
                  opacity: createUser.isPending ? 0.7 : 1,
                  cursor: createUser.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {createUser.isPending ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: User;
  onClose: () => void;
}

function EditUserModal({ user, onClose }: EditUserModalProps) {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [role, setRole] = useState<Role>(user.role);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errorMsg, setErrorMsg] = useState('');

  const updateUser = useMutation({
    mutationFn: async (dto: {
      email?: string;
      firstName?: string;
      lastName?: string;
      role?: string;
      phone?: string;
    }) => {
      const { data } = await api.patch<ApiResponse<User>>(`/users/${user.id}`, dto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        axiosErr?.response?.data?.message ?? 'Une erreur est survenue. Veuillez réessayer.',
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    updateUser.mutate({
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '480px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>
            Modifier l'utilisateur
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: theme.colors.textLight,
              lineHeight: 1,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ ...modalStyles.body }}>
          {errorMsg && (
            <div
              style={{
                background: theme.colors.dangerLight,
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: theme.radius.md,
                fontSize: theme.font.sizeSm,
                marginBottom: '1rem',
                border: '1px solid #fca5a5',
              }}
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              <Field
                label="Prénom"
                id="edit-firstName"
                value={firstName}
                onChange={setFirstName}
                required
              />
              <Field
                label="Nom"
                id="edit-lastName"
                value={lastName}
                onChange={setLastName}
                required
              />
            </div>

            <Field
              label="Email"
              id="edit-email"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />

            <Field label="Rôle" id="edit-role" value={role} onChange={(v) => setRole(v as Role)} required>
              <option value={Role.TECHNICIAN}>Technicien</option>
              <option value={Role.DISPATCHER}>Répartiteur</option>
              <option value={Role.ADMIN}>Admin</option>
            </Field>

            <Field
              label="Téléphone"
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="+33 6 12 34 56 78"
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ ...buttonStyles.secondary, flex: 1 }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={updateUser.isPending}
                style={{
                  ...buttonStyles.primary,
                  flex: 1,
                  opacity: updateUser.isPending ? 0.7 : 1,
                  cursor: updateUser.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {updateUser.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

function ResetPasswordModal({ userId, userName, onClose }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const resetPassword = useMutation({
    mutationFn: () => adminResetPassword(userId, newPassword),
    onSuccess: () => {
      setSuccessMsg('Mot de passe réinitialisé avec succès.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => onClose(), 1500);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        axiosErr?.response?.data?.message ?? 'Une erreur est survenue. Veuillez réessayer.',
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }
    resetPassword.mutate();
  };

  return (
    <div style={{ ...modalStyles.overlay }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalStyles.content, maxWidth: '420px' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>
            Réinitialiser le mot de passe
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: theme.colors.textLight,
              lineHeight: 1,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ ...modalStyles.body }}>
          <p style={{ fontSize: theme.font.sizeSm, color: theme.colors.textLight, marginBottom: '1rem' }}>
            Définir un nouveau mot de passe pour <strong>{userName}</strong>.
          </p>

          {errorMsg && (
            <div
              style={{
                background: theme.colors.dangerLight,
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: theme.radius.md,
                fontSize: theme.font.sizeSm,
                marginBottom: '1rem',
                border: '1px solid #fca5a5',
              }}
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: theme.colors.successLight,
                color: '#065f46',
                padding: '0.75rem 1rem',
                borderRadius: theme.radius.md,
                fontSize: theme.font.sizeSm,
                marginBottom: '1rem',
                border: '1px solid #6ee7b7',
              }}
            >
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Field
              label="Nouveau mot de passe"
              id="reset-newPassword"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              required
              placeholder="••••••••"
            />

            <Field
              label="Confirmer le mot de passe"
              id="reset-confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              placeholder="••••••••"
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ ...buttonStyles.secondary, flex: 1 }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={resetPassword.isPending}
                style={{
                  ...buttonStyles.danger,
                  flex: 1,
                  opacity: resetPassword.isPending ? 0.7 : 1,
                  cursor: resetPassword.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {resetPassword.isPending ? 'Réinitialisation…' : '🔑 Réinitialiser'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── UsersPage ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { t: tNav } = useTranslation('nav');
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data } = await api.patch<ApiResponse<User>>(`/users/${id}`, { isActive });
      return data.data;
    },
    onMutate: ({ id }) => setTogglingId(id),
    onSettled: () => setTogglingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>{tNav('users')}</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{ ...buttonStyles.primary }}
        >
          + {tNav('users')}
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <div
          style={{
            ...cardStyles.card,
            padding: '2rem',
            color: theme.colors.danger,
            textAlign: 'center',
          }}
        >
          Erreur de chargement
        </div>
      ) : (
        <div style={{ ...tableStyles.container }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ ...tableStyles.header }}>
              <tr>
                {['Nom', 'Email', 'Rôle', 'Téléphone', 'Statut', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{ ...tableStyles.headerCell, textAlign: 'left' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((user, index) => (
                <tr
                  key={user.id}
                  style={getRowStyle(index, hoveredRow === index)}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Name */}
                  <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                    {user.firstName} {user.lastName}
                  </td>

                  {/* Email */}
                  <td style={{ ...tableStyles.cellMuted }}>
                    {user.email}
                  </td>

                  {/* Role badge */}
                  <td style={{ ...tableStyles.cell }}>
                    <span
                      style={{
                        background: ROLE_COLORS[user.role] + '1a',
                        color: ROLE_COLORS[user.role],
                        padding: '0.2rem 0.6rem',
                        borderRadius: theme.radius.full,
                        fontSize: theme.font.sizeXs,
                        fontWeight: theme.font.weightSemibold,
                      }}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>

                  {/* Phone */}
                  <td style={{ ...tableStyles.cellMuted }}>
                    {user.phone ?? '—'}
                  </td>

                  {/* Active badge */}
                  <td style={{ ...tableStyles.cell }}>
                    <span
                      style={{
                        background: user.isActive ? theme.colors.successLight : theme.colors.dangerLight,
                        color: user.isActive ? '#065f46' : '#991b1b',
                        padding: '0.2rem 0.6rem',
                        borderRadius: theme.radius.full,
                        fontSize: theme.font.sizeXs,
                        fontWeight: theme.font.weightSemibold,
                      }}
                    >
                      {user.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ ...tableStyles.cell }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {/* Edit button */}
                      <button
                        onClick={() => setEditUser(user)}
                        style={{
                          background: theme.colors.surfaceAlt,
                          border: theme.borders.default,
                          borderRadius: theme.radius.sm,
                          padding: '0.3rem 0.6rem',
                          cursor: 'pointer',
                          fontSize: theme.font.sizeXs,
                          color: theme.colors.text,
                          fontWeight: theme.font.weightMedium,
                        }}
                        title="Modifier"
                      >
                        ✏️ Modifier
                      </button>

                      {/* Reset password button */}
                      <button
                        onClick={() => setResetPasswordUser(user)}
                        style={{
                          background: '#fef3c7',
                          border: '1px solid #fcd34d',
                          borderRadius: theme.radius.sm,
                          padding: '0.3rem 0.6rem',
                          cursor: 'pointer',
                          fontSize: theme.font.sizeXs,
                          color: '#92400e',
                          fontWeight: theme.font.weightMedium,
                        }}
                        title="Réinitialiser le mot de passe"
                      >
                        🔑 MDP
                      </button>

                      {/* Toggle active button */}
                      <button
                        onClick={() =>
                          toggleActive.mutate({ id: user.id, isActive: !user.isActive })
                        }
                        disabled={togglingId === user.id}
                        style={{
                          background: user.isActive ? theme.colors.dangerLight : theme.colors.successLight,
                          border: `1px solid ${user.isActive ? '#fca5a5' : '#6ee7b7'}`,
                          borderRadius: theme.radius.sm,
                          padding: '0.3rem 0.6rem',
                          cursor: togglingId === user.id ? 'not-allowed' : 'pointer',
                          fontSize: theme.font.sizeXs,
                          color: user.isActive ? '#991b1b' : '#065f46',
                          fontWeight: theme.font.weightMedium,
                          opacity: togglingId === user.id ? 0.6 : 1,
                        }}
                        title={user.isActive ? 'Désactiver' : 'Réactiver'}
                      >
                        {user.isActive ? '🔒 Désactiver' : '🔓 Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {(users ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: theme.colors.textLight,
                      fontSize: theme.font.sizeSm,
                    }}
                  >
                    {tNav('users')} — {tNav('empty', { defaultValue: 'Aucun résultat' })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateUserModal onClose={() => setShowCreateModal(false)} />
      )}

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      )}

      {resetPasswordUser && (
        <ResetPasswordModal
          userId={resetPasswordUser.id}
          userName={`${resetPasswordUser.firstName} ${resetPasswordUser.lastName}`}
          onClose={() => setResetPasswordUser(null)}
        />
      )}
    </div>
  );
}
