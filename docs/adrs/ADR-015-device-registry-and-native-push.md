# ADR-015 — Device registry, native push via Expo Push Service, device sessions

- **Status**: Proposed
- **Date**: 2026-09-16
- **Deciders**: cverreault
- **Supersedes**: —
- **Amends**: [ADR-004](ADR-004-authentication-authorization.md) (refresh-token rows gain a device dimension); closes the « Mobile-app push channel » item in [ADR-013](ADR-013-alert-rules-engine.md) « Not in v1 »

## Context

The notifications module delivers push through `web-push` and VAPID only.
`PushSubscription` stores a browser endpoint plus `p256dh`/`auth` keys;
dead subscriptions are pruned on HTTP 404/410 from the push service. None
of that applies to a native app: iOS needs APNs, Android needs FCM, and
the token lifecycle (rotation, `DeviceNotRegistered`) is different.

Auth is bearer-only with rotating refresh tokens grouped by `family`
(ADR-004, C6). A `RefreshToken` row has no device metadata and
`POST /auth/logout` revokes exactly one token. A technician who loses a
phone has no way to sign that phone out.

ADR-013 anticipated this: « `PushChannelService.send()` gains a
device-token branch; alerts module doesn't change ». This ADR decides
where device tokens live, who sends, and how the branch is wired without
a cross-module import.

## Decisions

### 1. A `devices` table owned by the new `mobile` module

One row per `(tenantId, installationId)` where `installationId` is the
client UUID from `X-Device-Id` (ADR-014 §4). The row is **re-bound** to
whoever logs in on that phone (a shared truck tablet is one device, many
users over time). Columns: `userId`, `platform` (`IOS | ANDROID`),
`provider` (`EXPO | FCM | APNS`, only `EXPO` used in v1 — the column keeps
the door open), `pushToken` (unique, nullable), `pushTokenInvalidatedAt`,
`appVersion`, `osVersion`, `model`, `locale`, `lastSeenAt`, `revokedAt`.

**Rejected**: extending `push_subscriptions` with a `kind` column. The
two have different lifecycles and keys, and it would make `notifications`
own device metadata (app version, OS, last seen) it has no use for.

### 2. Delivery through Expo Push Service

`MobilePushService` posts to `https://exp.host/--/api/v2/push/send` in
batches of 100 and polls receipts every 15 minutes to null out tokens
reported `DeviceNotRegistered`. An optional `EXPO_ACCESS_TOKEN`
(resolved through `ISystemConfigResolver`, key `mobile.expo-access-token`)
raises the rate limit; without it the service still works.

**Rejected**: direct FCM HTTP v1 + APNs. Two SDKs and two credential sets
that **every self-hosted operator** would have to provision (a Firebase
service account and an APNs key) before a single notification is sent.
With Expo, the platform credentials travel inside the app binary we build
on EAS; a self-hosted server needs nothing.

Privacy note, for consistency with ADR-008: payloads carry only a title,
a body and `{ workOrderId, url }`. That is the same class of data Web
Push already routes through Google and Mozilla relays. A tenant that
refuses the relay sets `mobile.push.enabled=false` and gets in-app only.

### 3. The device-token branch is a contract, not an import

`common/contracts/mobile-push.contract.ts` exports the DI token
`MOBILE_PUSH_SENDER` and

```ts
interface IMobilePushSender {
  sendToUser(input: { userId: string; title: string; body?: string; data?: Record<string, unknown> }): Promise<boolean>;
}
```

`MobileModule` is `@Global()` and binds the token to `MobilePushService`,
exactly like `SYSTEM_CONFIG_RESOLVER` is bound today.
`PushChannelService.send()` injects it `@Optional()`. **A user with an
active device (not revoked, token present, seen in the last 30 days) gets
the native push only; web-push subscriptions are skipped for that user.**
Otherwise web-push runs as today. Without the rule, a technician who also
kept the PWA on the same phone would be notified twice for every event. `notifications` never imports
`modules/mobile`; `npm run arch:check` stays at zero exceptions.

**Rejected** because:
- *`notifications` reading and writing `devices` directly* — it would
  write to another module's table to prune dead tokens.
- *Event round-trip (`emitAsync('mobile.push.requested')`)* — works, but
  returns an array of listener results and hides the single success
  boolean the channel needs to mark a notification `SENT`.

### 4. Sessions are devices: `refresh_tokens.device_id` + revocation by event

`AuthService.generateTokens()` reads `deviceId` from the request context
(filled by `TenantResolverMiddleware` from `X-Device-Id`) and stores it on
the refresh-token row on login, 2FA completion and refresh. Web tokens
keep `NULL`. `DELETE /api/me/devices/:installationId` marks the device
revoked, nulls its push token and `emitAsync`s `mobile.device.revoked`; an
auth listener revokes every non-revoked token of that device for that
user **before the HTTP response returns**.

**Rejected** because:
- *A full « my sessions » page listing browsers too* — web tokens carry no
  metadata today; adding user-agent and IP to `RefreshToken` is a
  separate decision.
- *A foreign key from `refresh_tokens` to `devices` with cascade* — auth
  would depend on a mobile table for its own invariant. The event keeps
  the arrow `mobile → auth` soft.

### 5. Heartbeat and minimum app version

`POST /api/me/devices/:installationId/heartbeat` refreshes `lastSeenAt`,
`appVersion` and `pushToken`, and answers `{ upgradeRequired, minAppVersion }`
computed from `mobile.min-app-version.ios` / `.android` (system configs
with env fallbacks). The same values are exposed pre-login by the public
`GET /api/mobile/config` so a blocked build can show the upgrade screen
before asking for credentials.

## Not in v1

- Listing or revoking web sessions.
- Silent, data-only « sync now » pushes (the app pulls on foreground, on
  reachability change and when a visible push arrives).
- Per-device notification preferences (they stay per user).
- Direct FCM / APNs adapters behind the `provider` column.
- Push analytics (delivered / opened counts).
