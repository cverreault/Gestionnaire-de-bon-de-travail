/**
 * Native push branch of the notifications channel (ADR-015 §3).
 *
 * `mobile` binds `MOBILE_PUSH_SENDER` to its `MobilePushService` in a
 * `@Global()` module ; `notifications` injects it `@Optional()` and never
 * imports `modules/mobile`. A user with an active device gets the native
 * push only (no double notification with a PWA on the same phone).
 */
export const MOBILE_PUSH_SENDER = Symbol('MOBILE_PUSH_SENDER');

export interface MobilePushInput {
  userId: string;
  title: string;
  body?: string;
  /** Small, non-sensitive payload : { workOrderId, url } (ADR-015 §2 privacy note). */
  data?: Record<string, unknown>;
}

export interface IMobilePushSender {
  /** True when the user has a live device (not revoked, token present, seen in the last 30 days) and the relay is enabled. */
  hasActiveDevice(userId: string): Promise<boolean>;
  /** True when at least one device accepted the message. */
  sendToUser(input: MobilePushInput): Promise<boolean>;
}
