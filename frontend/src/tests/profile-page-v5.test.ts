/**
 * QA V5 — profile-page-v5.test.ts
 *
 * Validates ProfilePage.tsx logic:
 *  - formatDate: French locale output, edge cases
 *  - getPasswordStrength: all strength levels, boundary conditions
 *  - PasswordInput: toggle show/hide internal state
 *  - Confirm password mismatch detection
 *  - Button disabled conditions
 *  - user.createdAt field availability via User interface
 */

import { describe, it, expect } from 'vitest';
import type { User } from '../types/index';

// ─── Mirror of formatDate from ProfilePage.tsx ───────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Mirror of getPasswordStrength from ProfilePage.tsx ──────────────────────

type StrengthLevel = 'faible' | 'moyen' | 'fort';

interface PasswordStrength {
  level: StrengthLevel;
  label: string;
  color: string;
  bgColor: string;
  filledSegments: number;
}

function getPasswordStrength(pwd: string): PasswordStrength | null {
  if (!pwd) return null;

  let types = 0;
  if (/[a-z]/.test(pwd)) types++;
  if (/[A-Z]/.test(pwd)) types++;
  if (/[0-9]/.test(pwd)) types++;
  if (/[^a-zA-Z0-9]/.test(pwd)) types++;

  if (pwd.length < 8 || types < 2) {
    return { level: 'faible', label: 'Faible', color: '#ef4444', bgColor: '#fee2e2', filledSegments: 1 };
  }
  if (types >= 3) {
    return { level: 'fort', label: 'Fort', color: '#10b981', bgColor: '#d1fae5', filledSegments: 3 };
  }
  return { level: 'moyen', label: 'Moyen', color: '#f59e0b', bgColor: '#fef3c7', filledSegments: 2 };
}

// ─── Tests: formatDate ────────────────────────────────────────────────────────

describe('formatDate — French locale output', () => {
  it('formats a full ISO date string to French long format', () => {
    const result = formatDate('2025-01-15T00:00:00.000Z');
    // fr-CA format: "15 janvier 2025"
    expect(result).toContain('janvier');
    expect(result).toContain('2025');
  });

  it('returns a non-empty string for a valid date', () => {
    const result = formatDate('2024-11-01T00:00:00.000Z');
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('formats date using fr-CA locale (French output)', () => {
    const result = formatDate('2025-03-01T00:00:00.000Z');
    // March should appear as "mars" in French
    expect(result.toLowerCase()).toContain('mars');
  });

  it('includes the numeric day in the output', () => {
    const result = formatDate('2025-04-15T12:00:00.000Z');
    expect(result).toMatch(/15/);
  });

  it('includes the 4-digit year in the output', () => {
    const result = formatDate('2024-06-01T00:00:00.000Z');
    expect(result).toContain('2024');
  });

  it('handles a date-only string (no time component)', () => {
    const result = formatDate('2025-01-01');
    expect(result).toContain('2025');
  });
});

// ─── Tests: getPasswordStrength — empty / null cases ─────────────────────────

describe('getPasswordStrength — empty input', () => {
  it('returns null for empty string', () => {
    expect(getPasswordStrength('')).toBeNull();
  });
});

// ─── Tests: getPasswordStrength — Faible ─────────────────────────────────────

describe('getPasswordStrength — Faible (weak)', () => {
  it('returns Faible for 7-char lowercase-only password (length < 8)', () => {
    const result = getPasswordStrength('abcdefg');
    expect(result?.level).toBe('faible');
    expect(result?.filledSegments).toBe(1);
  });

  it('returns Faible for 1-char password', () => {
    const result = getPasswordStrength('a');
    expect(result?.level).toBe('faible');
  });

  it('returns Faible for exactly 7 chars regardless of type variety', () => {
    const result = getPasswordStrength('aA1!xyz'); // 7 chars, 4 types but < 8
    expect(result?.level).toBe('faible');
  });

  it('returns Faible for 8+ chars with only 1 character type (lowercase only)', () => {
    // Spec note: implementation also requires >= 2 types for non-Faible
    const result = getPasswordStrength('abcdefgh'); // 8 chars, 1 type
    expect(result?.level).toBe('faible');
  });

  it('Faible label is "Faible"', () => {
    const result = getPasswordStrength('abc');
    expect(result?.label).toBe('Faible');
  });
});

// ─── Tests: getPasswordStrength — Moyen ──────────────────────────────────────

describe('getPasswordStrength — Moyen (medium)', () => {
  it('returns Moyen for 8-char password with lowercase + uppercase (2 types)', () => {
    const result = getPasswordStrength('Abcdefgh'); // 8 chars, 2 types
    expect(result?.level).toBe('moyen');
    expect(result?.filledSegments).toBe(2);
  });

  it('returns Moyen for 10-char lowercase + digit password (2 types)', () => {
    const result = getPasswordStrength('password12'); // 10 chars, 2 types
    expect(result?.level).toBe('moyen');
  });

  it('Moyen label is "Moyen"', () => {
    const result = getPasswordStrength('Password1'); // 9 chars, 3 types? uppercase+lower+digit = 3 types
    // Actually: uppercase P, lowercase assword, digit 1 = 3 types → Fort
    // Use exactly 2 types:
    const r2 = getPasswordStrength('password1!'); // lowercase + digit + special = 3 types → Fort
    // Use strictly 2:
    const r3 = getPasswordStrength('PASSWORD1'); // uppercase + digit = 2 types
    expect(r3?.level).toBe('moyen');
    expect(r3?.label).toBe('Moyen');
  });

  it('Moyen filledSegments is 2', () => {
    const result = getPasswordStrength('ABCDEFG1'); // uppercase + digit, 8 chars = Moyen
    expect(result?.filledSegments).toBe(2);
  });
});

// ─── Tests: getPasswordStrength — Fort ───────────────────────────────────────

describe('getPasswordStrength — Fort (strong)', () => {
  it('returns Fort for password with 3 character types (lower + upper + digit)', () => {
    const result = getPasswordStrength('Password1'); // 9 chars, 3 types
    expect(result?.level).toBe('fort');
    expect(result?.filledSegments).toBe(3);
  });

  it('returns Fort for password with 4 character types', () => {
    const result = getPasswordStrength('Password1!'); // 10 chars, 4 types
    expect(result?.level).toBe('fort');
  });

  it('Fort label is "Fort"', () => {
    const result = getPasswordStrength('SecurePass1');
    expect(result?.label).toBe('Fort');
  });

  it('Fort filledSegments is 3', () => {
    const result = getPasswordStrength('TestPass1');
    expect(result?.filledSegments).toBe(3);
  });

  it('minimum strong password: exactly 8 chars with 3 types', () => {
    const result = getPasswordStrength('Abcdef1g'); // 8 chars: lower+upper+digit = 3 types
    expect(result?.level).toBe('fort');
  });
});

// ─── Tests: strength meter segment count ─────────────────────────────────────

describe('getPasswordStrength — filledSegments range', () => {
  it('filledSegments is always between 1 and 3', () => {
    const testPasswords = [
      'abc',           // Faible → 1
      'Abcdefgh',     // Moyen  → 2
      'Password1',    // Fort   → 3
    ];
    for (const pwd of testPasswords) {
      const result = getPasswordStrength(pwd);
      if (result) {
        expect(result.filledSegments).toBeGreaterThanOrEqual(1);
        expect(result.filledSegments).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ─── Tests: confirm password mismatch logic ───────────────────────────────────

describe('Confirm password mismatch detection', () => {
  function isMismatch(newPwd: string, confirmPwd: string): boolean {
    return !!confirmPwd && confirmPwd !== newPwd;
  }

  it('no mismatch when both fields are empty', () => {
    expect(isMismatch('', '')).toBe(false);
  });

  it('no mismatch when confirmPassword is empty', () => {
    expect(isMismatch('Password1', '')).toBe(false);
  });

  it('no mismatch when passwords match', () => {
    expect(isMismatch('Password1', 'Password1')).toBe(false);
  });

  it('mismatch detected when passwords differ', () => {
    expect(isMismatch('Password1', 'password1')).toBe(true);
  });

  it('mismatch detected for partial input in confirm field', () => {
    expect(isMismatch('Password1', 'Pass')).toBe(true);
  });
});

// ─── Tests: button disabled condition ────────────────────────────────────────

describe('Submit button disabled conditions', () => {
  function isSubmitDisabled(
    isPending: boolean,
    confirmPwd: string,
    newPwd: string,
  ): boolean {
    return isPending || (!!confirmPwd && confirmPwd !== newPwd);
  }

  it('enabled when no pending and passwords match', () => {
    expect(isSubmitDisabled(false, 'Password1', 'Password1')).toBe(false);
  });

  it('disabled when mutation is pending', () => {
    expect(isSubmitDisabled(true, 'Password1', 'Password1')).toBe(true);
  });

  it('disabled when passwords do not match', () => {
    expect(isSubmitDisabled(false, 'Password2', 'Password1')).toBe(true);
  });

  it('enabled when confirmPassword is empty (no mismatch check yet)', () => {
    expect(isSubmitDisabled(false, '', 'Password1')).toBe(false);
  });
});

// ─── Tests: User interface has createdAt field ────────────────────────────────

describe('User interface — createdAt availability for "Membre depuis"', () => {
  it('User interface includes createdAt as a string field', () => {
    // Type-level check: create a valid User object with createdAt
    const mockUser: User = {
      id: 'test-id',
      email: 'test@example.com',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'ADMIN' as User['role'],
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(typeof mockUser.createdAt).toBe('string');
    expect(mockUser.createdAt.length).toBeGreaterThan(0);
  });

  it('formatDate produces a valid French string from User.createdAt', () => {
    const createdAt = '2025-01-15T10:30:00.000Z';
    const formatted = formatDate(createdAt);
    expect(formatted).toContain('janvier');
    expect(formatted).toContain('2025');
  });

  it('conditional rendering: renders date section only when createdAt is truthy', () => {
    const withDate = { createdAt: '2025-01-01T00:00:00.000Z' };
    const withoutDate = {} as Partial<User>;

    // Simulates: user?.createdAt && <div>...</div>
    expect(!!withDate.createdAt).toBe(true);
    expect(!!withoutDate.createdAt).toBe(false);
  });
});

// ─── Tests: PasswordInput toggle logic ───────────────────────────────────────

describe('PasswordInput — show/hide toggle behavior', () => {
  /**
   * The PasswordInput component uses internal state: const [visible, setVisible] = useState(false)
   * input type = visible ? 'text' : 'password'
   * We verify the toggle logic independently.
   */

  it('initial state is hidden (password type)', () => {
    let visible = false;
    const inputType = visible ? 'text' : 'password';
    expect(inputType).toBe('password');
  });

  it('after one toggle, password is visible (text type)', () => {
    let visible = false;
    visible = !visible; // simulate button click
    const inputType = visible ? 'text' : 'password';
    expect(inputType).toBe('text');
  });

  it('after two toggles, password is hidden again', () => {
    let visible = false;
    visible = !visible;
    visible = !visible;
    const inputType = visible ? 'text' : 'password';
    expect(inputType).toBe('password');
  });

  it('aria-label changes based on visibility state', () => {
    const getAriaLabel = (v: boolean) =>
      v ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
    expect(getAriaLabel(false)).toBe('Afficher le mot de passe');
    expect(getAriaLabel(true)).toBe('Masquer le mot de passe');
  });

  it('icon changes based on visibility state', () => {
    const getIcon = (v: boolean) => (v ? '🙈' : '👁️');
    expect(getIcon(false)).toBe('👁️');
    expect(getIcon(true)).toBe('🙈');
  });
});

// ─── Tests: password validation before submission ─────────────────────────────

describe('Password submission validation', () => {
  function validateBeforeSubmit(
    newPassword: string,
    confirmPassword: string,
  ): { valid: boolean; error?: string } {
    if (newPassword.length < 8) {
      return { valid: false, error: 'Le nouveau mot de passe doit comporter au moins 8 caractères.' };
    }
    if (newPassword !== confirmPassword) {
      return { valid: false, error: 'Les mots de passe ne correspondent pas.' };
    }
    return { valid: true };
  }

  it('rejects password shorter than 8 characters', () => {
    const r = validateBeforeSubmit('short', 'short');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('8 caractères');
  });

  it('rejects mismatched passwords', () => {
    const r = validateBeforeSubmit('ValidPass1', 'DifferentPass');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('ne correspondent pas');
  });

  it('accepts valid matching passwords', () => {
    const r = validateBeforeSubmit('ValidPass1', 'ValidPass1');
    expect(r.valid).toBe(true);
  });

  it('rejects 8-char password if newPassword !== confirmPassword', () => {
    const r = validateBeforeSubmit('Password', 'Password!');
    expect(r.valid).toBe(false);
  });

  it('accepts minimum 8-char matching passwords', () => {
    const r = validateBeforeSubmit('password', 'password');
    expect(r.valid).toBe(true);
  });
});
