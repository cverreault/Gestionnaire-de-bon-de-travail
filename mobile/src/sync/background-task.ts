import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { backgroundPull } from './sync.store';

export const SYNC_TASK = 'dispatch2go-background-sync';

/**
 * Periodic delta pull while the app is closed (Android WorkManager / iOS
 * BGTaskScheduler, ≥ 15 min, at the OS's discretion). Fills the gap until
 * push is configured, and keeps the local list fresh anyway.
 */
TaskManager.defineTask(SYNC_TASK, async () => {
  const ok = await backgroundPull();
  return ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
    await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Unsupported (simulator, restricted battery mode) : foreground triggers still apply.
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) await BackgroundTask.unregisterTaskAsync(SYNC_TASK);
  } catch {
    // ignore
  }
}
