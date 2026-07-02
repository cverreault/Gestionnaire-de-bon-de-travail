import { create } from 'zustand';

/**
 * Tiny toast queue (B7.6).
 *
 * Replaces native `alert()` for non-blocking error / success feedback.
 * One global store, auto-dismiss after 5s, max 3 toasts on screen at
 * once. No external dependency, no portal acrobatics — the host
 * component lives in AppLayout.
 */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  items: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (kind, message) => {
    const id = nextId++;
    set({ items: [...get().items, { id, kind, message }].slice(-3) });
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => {
    set({ items: get().items.filter((t) => t.id !== id) });
  },
}));

/** Convenience helpers — keep call sites short. */
export const toast = {
  success: (msg: string) => useToastStore.getState().push('success', msg),
  error: (msg: string) => useToastStore.getState().push('error', msg),
  info: (msg: string) => useToastStore.getState().push('info', msg),
};
