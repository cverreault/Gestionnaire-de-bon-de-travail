import { create } from 'zustand';

interface ApkUpdateState {
  available: { version: string; url: string; size?: number; notes?: string } | null;
  /** 0..1 while downloading, null otherwise. */
  progress: number | null;
  error: string | null;
  checkedAt: number;
  set: (p: Partial<Omit<ApkUpdateState, 'set'>>) => void;
}

export const useApkUpdate = create<ApkUpdateState>((set) => ({ available: null, progress: null, error: null, checkedAt: 0, set: (p) => set(p) }));
