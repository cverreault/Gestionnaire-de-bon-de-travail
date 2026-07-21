/**
 * B32 — shared contract for a resolved public-API key.
 *
 * Lives in common/ so the guards, decorators and the public controllers
 * of several modules can reference it without importing the api-keys
 * module directly (modular-monolith boundary rule).
 */
export interface ResolvedApiKey {
  id: string;
  tenantId: string;
  name: string;
  scope: string;
  /** User who minted the key — used as the effective `createdBy` for
   * resources created through the key, since we don't have a real
   * request user in the machine-to-machine flow. */
  createdByUserId: string;
}
