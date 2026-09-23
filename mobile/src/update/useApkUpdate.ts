import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import { useApkUpdate } from './apk-update.store';
import { isNewerVersion, type ApkManifest } from './version';

/** B62 — re-check on every foreground after 15 min (6 h made a fresh publish invisible until a cold start). */
const CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

/** Sideloaded Android builds only : store builds are updated by Google Play (self-update is against its policy). */
export function apkSelfUpdateEnabled(): boolean {
  const distribution = (Constants.expoConfig?.extra as { distribution?: string } | undefined)?.distribution;
  return Platform.OS === 'android' && distribution !== 'store';
}

/** Polls `<workspace>/downloads/version.json` and exposes a newer APK when there is one. */
export async function checkForApkUpdate(force = false): Promise<void> {
  const { workspace } = useSession.getState();
  const store = useApkUpdate.getState();
  if (!apkSelfUpdateEnabled() || !workspace) return;
  if (!force && Date.now() - store.checkedAt < CHECK_MIN_INTERVAL_MS) return;
  try {
    const res = await fetch(`${workspace.baseUrl.replace(/\/+$/, '')}/downloads/version.json`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = (await res.json()) as ApkManifest;
    const android = manifest.android;
    const current = Application.nativeApplicationVersion ?? '0.0.0';
    store.set({
      checkedAt: Date.now(),
      available: android && isNewerVersion(android.version, current) ? { version: android.version, url: android.url, size: android.size, notes: android.notes } : null,
      error: null,
    });
  } catch (err) {
    store.set({ checkedAt: Date.now(), error: err instanceof Error ? err.message : String(err) });
  }
}

/** Downloads the APK into the cache and hands it to the Android package installer (the user confirms). */
export async function downloadAndInstallApk(): Promise<void> {
  const { available } = useApkUpdate.getState();
  const set = useApkUpdate.getState().set;
  if (!available || !apkSelfUpdateEnabled()) return;
  const target = `${FileSystem.cacheDirectory ?? ''}dispatch2go-${available.version}.apk`;
  set({ progress: 0, error: null });
  try {
    const dl = FileSystem.createDownloadResumable(available.url, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) set({ progress: totalBytesWritten / totalBytesExpectedToWrite });
    });
    const result = await dl.downloadAsync();
    if (!result || result.status !== 200) throw new Error(`HTTP ${result?.status ?? '?'}`);
    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
    set({ progress: null });
  } catch (err) {
    set({ progress: null, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Mounted once in the root layout : checks at start, on foreground (≤ every 6 h) and when the network comes back. */
export function useApkUpdateChecker(): void {
  const workspace = useSession((s) => s.workspace);
  const online = useSyncStore((s) => s.online);
  const first = useRef(true);
  useEffect(() => {
    if (!workspace || !apkSelfUpdateEnabled()) return;
    void checkForApkUpdate(first.current);
    first.current = false;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void checkForApkUpdate());
    // B62 — also poll while the app stays open all day on the truck's dashboard.
    const timer = setInterval(() => void checkForApkUpdate(), CHECK_MIN_INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [workspace, online]);
}
