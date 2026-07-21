---
name: review-security
description: Review hat — security. OWASP top 10, PII protection, endpoint RBAC, tenant isolation, UI-vs-backend validation, never-trust-input, secrets. A code-review lens for TaskMgr. Build secure, don't patch later.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(git *)
---

# Security review hat

**Applies when:** `backend/src/**`, `frontend/src/**`, `nginx/**`, `**/*.ts`, `**/*.tsx`, `**/*.sql`, `**/*.prisma`

Review the diff ONLY through the security lens. The philosophy is **build secure, don't patch at
the end** — treat security findings as **blocking by default**. Binding rules: [CLAUDE.md](../../../CLAUDE.md)
(Règles importantes), [ADR-004 authentication-authorization](../../../docs/adrs/ADR-004-authentication-authorization.md)
and [ADR-009 multi-tenancy](../../../docs/adrs/ADR-009-multi-tenancy.md).

## Check for

- **Broken access control / RBAC** — every controller route carries an explicit `@Roles(...)` (or
  a `@Public()` with a justifying comment). ⚠️ `RolesGuard` lets ANY authenticated role through a
  route with NO `@Roles` metadata — a missing decorator is a real hole (a CLIENT/TECHNICIAN reaching
  staff data). The role list must match the action actually performed; no over-broad role. **blocker**.
- **Tenant isolation** — tenant-scoped models go through the Prisma tenant-scope middleware
  (`common/prisma/tenant-scope.middleware.ts`), and any **raw SQL** (`$queryRaw*`/`$executeRaw*`)
  MUST carry an explicit `tenant_id` filter — the middleware does NOT touch raw SQL. New tenant-scoped
  models must be added to `TENANT_SCOPED_MODELS`. IDOR: a route taking `:id` must verify the row
  belongs to the caller's tenant AND (for TECHNICIAN/CLIENT) to the caller. **blocker**.
- **Injection** — SQL parameterized (bind vars `$1`, never string concat, even in `$queryRawUnsafe`),
  path traversal, deserialization of untrusted data. **blocker**.
- **Never trust user input** — server-side validation (`class-validator` DTOs via the global
  `I18nValidationPipe`, `whitelist: true`) for every request body; **UI validation is UX only, never
  the security boundary** — the API must re-validate. Use `i18nValidationMessage` in DTOs, never a
  hardcoded `message:`. Flag any endpoint relying on client-side checks. **blocker**.
- **XSS / SSRF** — no `dangerouslySetInnerHTML` on user data; the PDF/HTML templates must `esc()`
  every interpolation; no user-controlled outbound URL fetched without the SSRF guard (webhooks →
  `webhook-url-guard.ts`, resolve + reject reserved ranges, `redirect: 'manual'`). **blocker/warn**.
- **PII in logs/telemetry** — client names, addresses, phone numbers, photos and signatures must
  NEVER appear in logs (Pino redaction is configured — don't defeat it); log IDs only (Loi 25 /
  LPRPDE). **blocker**.
- **Secrets** — no API keys, passwords, connection strings, tokens in source or committed config;
  secrets live in `.env` (gitignored). JWT/webhook/config secrets read via `getOrThrow` — no
  hardcoded fallback. At-rest secrets encrypted (AES-256-GCM). **blocker**.
- **Error leakage** — no stack traces in responses; the `HttpExceptionFilter` shape only. **warn**.

## Report

Return each finding as `file:line — issue — fix`, severity. Lead with blockers. If genuinely
clean, say so explicitly (don't invent findings).
