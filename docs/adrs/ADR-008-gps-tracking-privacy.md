# ADR-008 — GPS tracking opt-in and 7-day retention

| Status | Accepted |
|---|---|
| Date | 2026-06-29 |
| Deciders | Carl Verreault |
| Supersedes | — |

## Context

The B5 chantier adds live technician position display on the dispatcher map. Tracking employee movement crosses Quebec's **Loi 25** (Loi modernisant des dispositions législatives en matière de protection des renseignements personnels) and federal **PIPEDA** boundaries. We must decide:

1. Default state (opt-in vs opt-out)
2. Granularity of consent (per-feature vs umbrella)
3. Retention period
4. Storage location (own DB vs third party)
5. Who can read positions
6. How to handle revocation

The product target is **small SMB field-service teams in Quebec** — the same operators that already use the `taskmgr_test` self-hosted Docker stack. Failing the Loi 25 transparency standard would block adoption.

## Decision

**Opt-in only, default OFF.** A technician's positions are recorded only after they actively flip a checkbox in their profile. The checkbox lives next to a French paragraph that names what is collected, why, who sees it, and how long it is kept.

**Per-feature consent.** The flag is `preferences.gps.enabled` — a single boolean, not a generic "data sharing" umbrella. If we add other tracking features later (Mikrotik webhook, vehicle GPS via Geotab), each gets its own flag.

**7-day retention.** A nightly cron deletes any `technician_locations` row older than 7 days. 7 days is the shortest window that still covers the "did the tech reach the site for that BT?" audit question after the fact — anything longer accumulates a movement profile beyond the operational need.

**Server-side enforcement.** Every `POST /me/location` re-reads the user's `preferences.gps.enabled`. A stale tab or a tampered client can't keep posting after opt-out. Rejected with HTTP 403, not silently dropped — the client surfaces this to the user.

**Storage: own Postgres.** Same DB as the rest of TaskMgr. No third-party processor for tracking data (an extra processor would need its own consent clause).

**Reader scope: ADMIN + DISPATCHER only.** Techs cannot see other techs' positions. Their own position is also not displayed back to them — they know where they are.

**Revocation is immediate.** Unchecking the box stops further inserts and the user-facing intent is preserved; the already-accumulated history is purged within 24h by the next retention sweep. We do NOT delete history on opt-out because the dispatcher may legitimately need the last few positions for an open BT — but the 7-day window caps total exposure.

## Consequences

### Positive

- The default-OFF posture means a fresh deployment ships compliant; the operator opts in if useful.
- Per-feature consent keeps the consent paragraph short and concrete — easier to audit, easier for users to grant or revoke specifically.
- The 7-day retention is short enough to satisfy "minimum necessary" without crippling the live-dispatch use case.
- Server-side re-check is defence in depth — front-end bugs can't open a tracking hole.

### Negative

- The dispatcher map will be empty until at least one tech has opted in. This is a feature-discovery cliff. Mitigated in v1 by a help text on the dashboard card and an explicit "📍 Suivi de position" section in the tech's profile.
- The 7-day window means we cannot retroactively reconstruct movements beyond a week. Acceptable per the threat model — anything longer would need a different ADR.
- We do NOT support exporting a tech's own position history to themselves (PIPEDA right-of-access). Open question — see below.

### Neutral

- The `preferences.gps.enabled` shape is documented as a contract in `common/contracts/gps-preferences.contract.ts`. Future tracking features should follow the same shape (`preferences.<feature>.enabled`).

## Open questions

- **PIPEDA right-of-access**: a tech may legitimately ask "show me everything you have on me". Today, the answer is implicit (their own table rows + 7-day window). Should we add a `GET /me/locations/export` endpoint for completeness?
- **Tenant scope** (B6): multi-tenancy isn't here yet. When it lands, each tenant should be able to disable GPS tracking entirely at the tenant level (e.g., for unions / collective agreements that forbid it).
- **Audit log of consent changes**: today, flipping the toggle is a `user.preferences.changed` event that the audit module records. Sufficient for now. Loi 25 audits may ask for a sworn statement of when consent was granted/revoked — the audit row covers it.

## References

- B5.1 commit — schema + opt-in contract
- B5.2 commit — endpoints + server-side enforcement
- B5.3 commit — opt-in toggle UI
- B5.5 commit — 7-day retention cron
- [Loi 25 — Article 16 (consentement)](https://www.cai.gouv.qc.ca/loi-25/)
- [PIPEDA — Principle 7 (Safeguards)](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/)
