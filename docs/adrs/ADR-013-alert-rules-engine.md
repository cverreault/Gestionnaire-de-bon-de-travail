# ADR-013 — Configurable alert rules engine

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: cverreault
- **Supersedes**: —

## Context

Until now, the notifications module could only react to a small hardcoded
list of events (`workOrder.assigned`, `workOrder.slaBreached`). A tenant
admin couldn't say « when a BT completes negatively, email the dispatcher
AND notify the client ». That level of control is table stakes for a
dispatch product.

B10 adds a rule-based layer: the admin defines « when event X on a WO
matching filters Y, notify recipients Z on channels C with template T ».
Rules are stored per-tenant, matched at event-emission time, and dispatched
through the existing notifications machinery.

## Decisions

### 1. Rules attach by event-name filter, NOT as a column on `process_transitions`

The exploration turned up an obvious alternative — add a `notifyRoles Role[]`
column on `process_transitions` beside the existing `allowedRoles`. That's
tempting because the process editor is already where an admin thinks about
"what happens on this transition".

**Rejected** because:
- Rules that span multiple processes (« alert on ANY complete-negative ») need
  N configurations, one per process.
- Filters beyond process boundaries (« only on task type X », « only when
  priority=HIGH ») don't map to a per-transition column.
- Coupling notifications to the state-machine schema means every alert
  change forces a process version bump — bad for iteration.
- The current design lets us extend to `clients.*` and `apiIntegration.*`
  events without touching the process module.

### 2. Simple `{{path.to.field}}` templating, NOT Handlebars

The template language has to be simple enough that a non-technical admin
can compose one in a text input without a syntax reference. Handlebars adds
`{{#if}}`, `{{#each}}`, custom helpers — none of which we need for the MVP
use cases (« BT {{reference}} — {{status}} : {{reason}} »).

Missing paths render as empty string rather than throwing — a broken
template must never take down the dispatch chain (which is called from
inside a domain-event listener).

Trade-off: no logic in templates. When the demand emerges (« if
outcome=negative say X else say Y »), we swap the renderer implementation
without touching stored rules — the path-substitution pattern is a strict
subset of Handlebars.

### 3. Distinct client-facing template pair (`clientTitleTemplate`, `clientBodyTemplate`)

When `recipientClient = true`, the rule MUST provide a second title/body
pair. Enforced in `AlertsService.validate()`.

Reason: internal templates typically reference operational context
(technician name, internal reason codes, status IDs) that we don't want
leaking to a customer. Forcing a second, explicitly external template
prevents the accidental « the tech Marie is annoyed because you were
absent » message going to the client.

An empty client template would fall back to the internal one — we
deliberately reject that at the API level.

### 4. SMS deferred to v1.1 with a stubbed adapter

The channel checkbox appears in the UI, the DB stores `sms` in the array,
and `AlertDispatcherService` calls `SmsChannelService.send()` — but that
send() only logs. Rationale:

- Every SMS provider (Twilio, Vonage, MessageBird, AWS SNS…) has a slightly
  different API. Locking in a provider now, before we have a paying customer
  who needs SMS, would either constrain us or force a future migration.
- The wire-through matters: an admin who wants alerts today can plan their
  SMS templates as if delivery worked, and v1.1 flips the switch by
  swapping the adapter's implementation (no schema change, no UI change,
  no template rewrite).
- The stub still logs the outbound message with the actual recipient +
  body, so the operator can verify the pipeline end-to-end and count how
  many SMS they would have sent — useful data for choosing a provider.

Provider selection reads from `SystemConfigService` (`sms.provider`) so
the SA can flip it live in v1.1 without redeploying.

### 5. Internal targets go through NotificationsService (no double-dispatch)

For internal recipients, the dispatcher calls `NotificationsService.create()`
which owns the inbox row AND fans out to email/push based on the user's
own preferences. We do NOT dispatch email/push directly in the alerts
module for internal users — that would violate per-user opt-out and could
send the same message twice to someone who's on both channels.

For external targets (client), we bypass the inbox (there's no TaskMgr
account) and call `EmailChannelService.send()` / `SmsChannelService.send()`
directly with the client-facing template pair.

### 6. Per-tenant in-memory rule cache in `AlertsService`

`AlertsService.getActiveForTenant()` caches active rules in a
`Map<tenantId, AlertRuleRow[]>`. Any CRUD invalidates the entry. The hot
path (each `workOrders.**` event) reads from the cache; a cache miss falls
back to Prisma. Simple, no external dep.

Trade-off: horizontal scaling requires cache invalidation across replicas.
That's a v2 concern (we'll broadcast via `EventEmitter2` or Redis pub/sub
when we get there); for a single-instance backend, this is a clean
lookup-free path.

### 7. Cross-cutting: alerts as a separate module rather than a folder inside `notifications/`

`alerts/` owns rule matching + recipient resolution + template rendering.
`notifications/` owns delivery (inbox + email + push + sms). The
dependency arrow is clean: `alerts → notifications`, never the reverse.

Rationale: they answer different questions. Notifications: "given a
recipient + a message + channels, deliver". Alerts: "given an event,
who should be notified with what message?" The rule engine could in
principle drive other outbound systems later (feed → dashboard, feed →
Slack, feed → PagerDuty). Keeping it a peer module makes those additions
straightforward.

## Not in v1

- Actual SMS delivery (see #4).
- Templating logic (`{{#if}}`, helpers).
- Per-recipient channel overrides (a rule fixes the channel set for all
  its targets).
- Quiet hours / do-not-disturb windows.
- Filtering by payload contents beyond taskType + priority (« only when
  amount > 500€ »).
- Rate limiting per rule (« max 5 emails per hour for this rule »).
- Test button ("send a fake fire of this rule to me now") — planned for
  v1.1 alongside SMS.
- Mobile-app push channel — depends on the future mobile app choosing FCM
  vs. APNs. When it lands, `PushChannelService.send()` gains a device-token
  branch; alerts module doesn't change.
