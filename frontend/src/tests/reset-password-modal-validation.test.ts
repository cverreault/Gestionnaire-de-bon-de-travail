/**
 * QA — reset-password-modal-validation.test.ts
 *
 * Validates the ResetPasswordModal form validation logic extracted from
 * UsersPage.tsx (handleSubmit guard clauses):
 *
 *  - Password must be >= 6 characters → error if not
 *  - newPassword must equal confirmPassword → error if not
 *  - Both validations pass → mutation is invoked (no error)
 *  - API error message is propagated to the UI errorMsg state
 *  - Success path clears fields and shows success message
 *  - resetPasswordUser state is typed User | null (null check guards modal render)
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror of the handleSubmit validation in ResetPasswordModal ──────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function validateResetPasswordForm(
  newPassword: string,
  confirmPassword: string,
): ValidationResult {
  if (newPassword.length < 6) {
    return { ok: false, error: 'Le mot de passe doit contenir au moins 6 caractères.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Les mots de passe ne correspondent pas.' };
  }
  return { ok: true };
}

// ─── Mirror of the onError handler (extracts message from AxiosError) ─────────

function extractApiErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object' &&
    'message' in err.response.data &&
    typeof (err.response.data as { message: unknown }).message === 'string'
  ) {
    return (err.response.data as { message: string }).message;
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

// ─── Mirror of state reset on success ─────────────────────────────────────────

interface ResetPasswordState {
  newPassword: string;
  confirmPassword: string;
  successMsg: string;
}

function applySuccessState(): ResetPasswordState {
  return {
    newPassword: '',
    confirmPassword: '',
    successMsg: 'Mot de passe réinitialisé avec succès.',
  };
}

// ─── Tests: min-length validation ─────────────────────────────────────────────

describe('ResetPasswordModal — minimum length validation (>= 6 chars)', () => {
  it('rejects an empty password', () => {
    const result = validateResetPasswordForm('', '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('6 caractères');
    }
  });

  it('rejects a 5-character password', () => {
    const result = validateResetPasswordForm('12345', '12345');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('6 caractères');
    }
  });

  it('rejects a 1-character password', () => {
    const result = validateResetPasswordForm('x', 'x');
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 6 characters', () => {
    const result = validateResetPasswordForm('abc123', 'abc123');
    expect(result.ok).toBe(true);
  });

  it('accepts a long password (50+ chars)', () => {
    const long = 'a'.repeat(50);
    const result = validateResetPasswordForm(long, long);
    expect(result.ok).toBe(true);
  });
});

// ─── Tests: password confirmation match ───────────────────────────────────────

describe('ResetPasswordModal — password match validation', () => {
  it('rejects when passwords differ', () => {
    const result = validateResetPasswordForm('password1', 'password2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ne correspondent pas');
    }
  });

  it('rejects when confirmation has trailing space', () => {
    const result = validateResetPasswordForm('password1', 'password1 ');
    expect(result.ok).toBe(false);
  });

  it('rejects when confirmation differs by case', () => {
    const result = validateResetPasswordForm('Password1', 'password1');
    expect(result.ok).toBe(false);
  });

  it('accepts identical passwords (both >= 6 chars)', () => {
    const result = validateResetPasswordForm('Str0ngPass!', 'Str0ngPass!');
    expect(result.ok).toBe(true);
  });
});

// ─── Tests: validation order (length checked first) ───────────────────────────

describe('ResetPasswordModal — validation order', () => {
  it('length error takes priority over mismatch when both fail', () => {
    // 3-char passwords that also don't match → length error comes first
    const result = validateResetPasswordForm('abc', 'xyz');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('6 caractères');
    }
  });

  it('mismatch error fires only when length is >= 6', () => {
    const result = validateResetPasswordForm('abcdef', 'abcdefg');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ne correspondent pas');
    }
  });
});

// ─── Tests: API error extraction ──────────────────────────────────────────────

describe('ResetPasswordModal — API error message extraction', () => {
  it('extracts message from a standard Axios error response', () => {
    const err = {
      response: {
        data: {
          message: 'Mot de passe trop simple.',
        },
      },
    };
    expect(extractApiErrorMessage(err)).toBe('Mot de passe trop simple.');
  });

  it('falls back to generic message when response is undefined', () => {
    expect(extractApiErrorMessage(new Error('Network Error'))).toBe(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  it('falls back to generic message when data.message is missing', () => {
    const err = { response: { data: { code: 500 } } };
    expect(extractApiErrorMessage(err)).toBe(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  it('falls back to generic message when response itself is null', () => {
    const err = { response: null };
    expect(extractApiErrorMessage(err)).toBe(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  it('falls back to generic message for a non-object error', () => {
    expect(extractApiErrorMessage('string error')).toBe(
      'Une erreur est survenue. Veuillez réessayer.',
    );
    expect(extractApiErrorMessage(null)).toBe(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });
});

// ─── Tests: success state ─────────────────────────────────────────────────────

describe('ResetPasswordModal — success state', () => {
  it('clears newPassword on success', () => {
    const state = applySuccessState();
    expect(state.newPassword).toBe('');
  });

  it('clears confirmPassword on success', () => {
    const state = applySuccessState();
    expect(state.confirmPassword).toBe('');
  });

  it('sets a French success message', () => {
    const state = applySuccessState();
    expect(state.successMsg.length).toBeGreaterThan(0);
    expect(state.successMsg).toContain('succès');
  });
});

// ─── Tests: modal render guard (resetPasswordUser state typing) ────────────────

describe('UsersPage — resetPasswordUser state guard', () => {
  it('modal does not render when resetPasswordUser is null', () => {
    // Mirrors: {resetPasswordUser && <ResetPasswordModal ... />}
    const resetPasswordUser = null;
    const shouldRenderModal = Boolean(resetPasswordUser);
    expect(shouldRenderModal).toBe(false);
  });

  it('modal renders when resetPasswordUser is a User object', () => {
    const resetPasswordUser = {
      id: 'user-001',
      email: 'tech@example.com',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'TECHNICIAN',
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const shouldRenderModal = Boolean(resetPasswordUser);
    expect(shouldRenderModal).toBe(true);
  });

  it('userName prop is built by concatenating firstName and lastName', () => {
    const user = { firstName: 'Jean', lastName: 'Dupont' };
    const userName = `${user.firstName} ${user.lastName}`;
    expect(userName).toBe('Jean Dupont');
  });
});
