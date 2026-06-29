/**
 * Shared contract for the platform-level runtime config store.
 *
 * Lives in `common/contracts/` so consumers (notifications channels,
 * future modules) can depend on the resolver shape without importing
 * the `system-configs` business module directly — keeping
 * `arch:check` (depcruise) happy and respecting ADR-001.
 *
 * The `system-configs` module remains the sole implementer and binds
 * its concrete `SystemConfigService` to the `SYSTEM_CONFIG_RESOLVER`
 * DI token. Channel services inject via the token, not the class.
 */

/** DI token — bind in `SystemConfigsModule.providers`. */
export const SYSTEM_CONFIG_RESOLVER = Symbol('SYSTEM_CONFIG_RESOLVER');

/** Minimal read-only surface used by channel services + future consumers. */
export interface ISystemConfigResolver {
  /**
   * Hierarchical lookup: DB row > process.env[envKey | envKeyFor(key)] > undefined.
   * Returns the decrypted value when the row is encrypted (no-op otherwise).
   */
  resolve(key: string, envKey?: string): Promise<string | undefined>;
}

/**
 * Event name emitted by the system-configs module on any config write.
 * Constants live here so listeners don't need to import the publisher
 * module to subscribe.
 */
export const SYSTEM_CONFIG_CHANGED_EVENT = 'systemConfigs.config.changed' as const;
