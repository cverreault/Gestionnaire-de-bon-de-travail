/**
 * IndexedDB-based offline store for TaskMgr PWA.
 *
 * Stores:
 *  - work_orders  : BTs cached for offline consultation
 *  - sync_queue   : Mutations queued while offline (replayed on reconnect)
 *  - clients      : Recently consulted clients
 */

import api from './api';
import type { WorkOrder } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncAction {
  id: string;
  type: 'status_change' | 'add_note' | 'upload_attachment';
  workOrderId: string;
  payload: any;
  timestamp: number;
}

/** Internal type for work orders stored with a TTL cache timestamp. */
type CachedWorkOrderEntry = WorkOrder & { _cachedAt?: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'taskmgr-offline';
const DB_VERSION = 1;

const STORE_WORK_ORDERS = 'work_orders';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_CLIENTS = 'clients';

/** Work orders cached more than 7 days ago are considered stale. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Class ────────────────────────────────────────────────────────────────────

class OfflineStore {
  private db: IDBDatabase | null = null;

  // ── Initialization ──────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_WORK_ORDERS)) {
          db.createObjectStore(STORE_WORK_ORDERS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_CLIENTS)) {
          db.createObjectStore(STORE_CLIENTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  private transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = 'readonly',
  ): IDBTransaction {
    if (!this.db) {
      throw new Error('OfflineStore: database not initialized — call init() first.');
    }
    return this.db.transaction(storeNames, mode);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retry a promise-returning function up to `maxRetries` times with
   * exponential backoff (500 ms → 1 000 ms → 2 000 ms).
   */
  private async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          await new Promise<void>((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }

  /** Delete stale work order entries by id. Runs fire-and-forget. */
  private async cleanupWorkOrders(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDERS);
    await Promise.all(ids.map((id) => this.promisifyRequest(store.delete(id))));
  }

  // ── Work Orders ─────────────────────────────────────────────────────────────

  /**
   * Save work orders without a TTL timestamp.
   * Kept for backward compatibility with existing callers.
   */
  async saveWorkOrders(workOrders: WorkOrder[]): Promise<void> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDERS);
    await Promise.all(workOrders.map((wo) => this.promisifyRequest(store.put(wo))));
  }

  /**
   * Cache work orders with the current timestamp for TTL-based expiry.
   * Call this after every successful API fetch to keep offline data fresh.
   */
  async cacheWorkOrders(workOrders: WorkOrder[]): Promise<void> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDERS);
    const now = Date.now();
    await Promise.all(
      workOrders.map((wo) =>
        this.promisifyRequest(
          store.put({ ...(wo as unknown as Record<string, unknown>), _cachedAt: now }),
        ),
      ),
    );
  }

  /**
   * Return all cached work orders.
   * Entries older than 7 days are automatically removed from IndexedDB.
   */
  async getCachedWorkOrders(): Promise<WorkOrder[]> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS);
    const store = tx.objectStore(STORE_WORK_ORDERS);
    const all = await this.promisifyRequest<CachedWorkOrderEntry[]>(
      store.getAll() as IDBRequest<CachedWorkOrderEntry[]>,
    );

    const now = Date.now();
    const fresh: WorkOrder[] = [];
    const staleIds: string[] = [];

    for (const entry of all) {
      if (entry._cachedAt && now - entry._cachedAt > TTL_MS) {
        staleIds.push(entry.id);
      } else {
        // Cast is safe: CachedWorkOrderEntry structurally extends WorkOrder
        fresh.push(entry as WorkOrder);
      }
    }

    if (staleIds.length > 0) {
      this.cleanupWorkOrders(staleIds).catch(console.warn);
    }

    return fresh;
  }

  /**
   * Return a single cached work order by id.
   * Returns null if not found or if the entry has expired (> 7 days).
   */
  async getCachedWorkOrder(id: string): Promise<WorkOrder | null> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS);
    const store = tx.objectStore(STORE_WORK_ORDERS);
    const entry = await this.promisifyRequest<CachedWorkOrderEntry | undefined>(
      store.get(id) as IDBRequest<CachedWorkOrderEntry | undefined>,
    );

    if (!entry) return null;

    if (entry._cachedAt && Date.now() - entry._cachedAt > TTL_MS) {
      this.cleanupWorkOrders([id]).catch(console.warn);
      return null;
    }

    return entry as WorkOrder;
  }

  // ── Legacy aliases (kept for compatibility) ─────────────────────────────────

  async getWorkOrders(): Promise<WorkOrder[]> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS);
    const store = tx.objectStore(STORE_WORK_ORDERS);
    return this.promisifyRequest<WorkOrder[]>(store.getAll() as IDBRequest<WorkOrder[]>);
  }

  async getWorkOrder(id: string): Promise<WorkOrder | null> {
    await this.getDB();
    const tx = this.transaction(STORE_WORK_ORDERS);
    const store = tx.objectStore(STORE_WORK_ORDERS);
    const result = await this.promisifyRequest<WorkOrder | undefined>(
      store.get(id) as IDBRequest<WorkOrder | undefined>,
    );
    return result ?? null;
  }

  // ── Sync Queue ──────────────────────────────────────────────────────────────

  async addToSyncQueue(action: SyncAction): Promise<void> {
    await this.getDB();
    const tx = this.transaction(STORE_SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    await this.promisifyRequest(store.put(action));
  }

  async getSyncQueue(): Promise<SyncAction[]> {
    await this.getDB();
    const tx = this.transaction(STORE_SYNC_QUEUE);
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const actions = await this.promisifyRequest<SyncAction[]>(
      store.getAll() as IDBRequest<SyncAction[]>,
    );
    // Return sorted by timestamp (oldest first)
    return actions.sort((a, b) => a.timestamp - b.timestamp);
  }

  async clearSyncItem(id: string): Promise<void> {
    await this.getDB();
    const tx = this.transaction(STORE_SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    await this.promisifyRequest(store.delete(id));
  }

  /** Returns the number of actions currently queued for sync. */
  async getPendingCount(): Promise<number> {
    await this.getDB();
    const tx = this.transaction(STORE_SYNC_QUEUE);
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    return this.promisifyRequest(store.count());
  }

  // ── Sync ────────────────────────────────────────────────────────────────────

  /**
   * Replays all queued actions against the live API.
   * Each action is retried up to 3 times with exponential backoff.
   * Successfully replayed actions are removed from the queue.
   * Persistently-failing actions stay in the queue for the next sync attempt.
   */
  async syncPending(): Promise<void> {
    const queue = await this.getSyncQueue();

    for (const action of queue) {
      try {
        await this.retryWithBackoff(async () => {
          switch (action.type) {
            case 'status_change':
              await api.post(`/work-orders/${action.workOrderId}/transition`, action.payload);
              break;

            case 'add_note':
              await api.post(`/work-orders/${action.workOrderId}/notes`, action.payload);
              break;

            case 'upload_attachment':
              // File blobs cannot be reliably stored in IndexedDB — skip silently.
              // The UI prevents attachment uploads while offline.
              console.warn(
                '[OfflineStore] upload_attachment sync not supported — skipping',
                action.id,
              );
              break;

            default:
              console.warn('[OfflineStore] Unknown sync action type:', (action as SyncAction).type);
          }
        });

        // Remove successfully replayed action
        await this.clearSyncItem(action.id);
      } catch (err) {
        console.error('[OfflineStore] Failed to sync action after retries', action.id, err);
        // Leave in queue for next attempt
      }
    }
  }

  // ── Clients cache ───────────────────────────────────────────────────────────

  async saveClients(clients: any[]): Promise<void> {
    await this.getDB();
    const tx = this.transaction(STORE_CLIENTS, 'readwrite');
    const store = tx.objectStore(STORE_CLIENTS);
    await Promise.all(clients.map((c) => this.promisifyRequest(store.put(c))));
  }

  async getClients(): Promise<any[]> {
    await this.getDB();
    const tx = this.transaction(STORE_CLIENTS);
    const store = tx.objectStore(STORE_CLIENTS);
    return this.promisifyRequest<any[]>(store.getAll());
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const offlineStore = new OfflineStore();
