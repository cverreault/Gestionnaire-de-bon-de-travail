import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Locale = 'fr' | 'en';

interface UiState {
  theme: ThemeMode;
  locale: Locale;
  setTheme: (t: ThemeMode) => void;
  setLocale: (l: Locale) => void;
}

/**
 * UI preferences (theme + language). Persisted locally so the first paint
 * matches the user's last choice on this device. On login, App.tsx hydrates
 * these from the server's `User.preferences` and writes back any change.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'fr',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'taskmgr-ui' },
  ),
);

/** Resolve 'system' to 'light' | 'dark' using `prefers-color-scheme`. */
export function resolveTheme(t: ThemeMode): 'light' | 'dark' {
  if (t === 'light' || t === 'dark') return t;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
