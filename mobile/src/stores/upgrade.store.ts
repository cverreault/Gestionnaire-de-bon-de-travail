import { create } from 'zustand';

interface UpgradeGate {
  upgradeRequired: boolean;
  minAppVersion: string | null;
  latestAppVersion: string | null;
  set: (g: { upgradeRequired: boolean; minAppVersion: string; latestAppVersion: string | null }) => void;
}

/** Version gate fed by the device heartbeat (B37.8); blocks the app when true. */
export const useUpgradeGate = create<UpgradeGate>((set) => ({
  upgradeRequired: false,
  minAppVersion: null,
  latestAppVersion: null,
  set: (g) => set(g),
}));
