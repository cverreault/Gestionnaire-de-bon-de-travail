import { useColorScheme } from 'react-native';

/**
 * Semantic colour tokens, same names as frontend/src/theme.ts so screens
 * read the same way on web and mobile (ADR-006 for the values).
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
}

export const LIGHT: Palette = {
  background: '#f3f4f6',
  surface: '#ffffff',
  surfaceAlt: '#f9fafb',
  border: '#e5e7eb',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  primary: '#1e40af',
  primaryLight: '#dbeafe',
  onPrimary: '#ffffff',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
};

export const DARK: Palette = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#273449',
  border: '#334155',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  primary: '#60a5fa',
  primaryLight: '#1e3a8a',
  onPrimary: '#0f172a',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;
export const font = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 } as const;

/** Status accent colours — server-driven step colours win when present. */
export const STATUS_COLORS: Record<string, string> = {
  CREATED: '#64748b',
  ASSIGNED: '#2563eb',
  DISPATCHED: '#7c3aed',
  EN_ROUTE: '#d97706',
  IN_PROGRESS: '#0891b2',
  COMPLETED_POSITIVE: '#15803d',
  COMPLETED_NEGATIVE: '#b91c1c',
  REQUESTED: '#94a3b8',
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
