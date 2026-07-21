---
name: goal
description: Autonomous goal loop for TaskMgr — implement toward a stated goal, verify end-to-end against the running app, get an independent Codex review, iterate until both pass, then push and open a PR and report exactly how to test. Pair with /loop for cross-turn re-triggering.
argument-hint: <what to build + how to verify it>
disable-model-invocation: true
---

# /goal — the autonomous build → verify → review loop

Drive a goal to completion: build it, **prove it works against the running app**, get it
**independently reviewed by Codex**, iterate until both are green, then push, open a PR, and tell
the user precisely how to test it.

## Pipeline

| #  | Step               | Uses                                      | Kind      |
|----|--------------------|-------------------------------------------|-----------|
| 1  | Parse goal         | —                                         | inline    |
| 2  | Branch off main    | git                                       | git       |
| 3  | Bring up stack     | docker compose up -d                      | harness   |
| 4  | Implement          | work-on-feature                           | skill     |
| 5  | Verify end-to-end  | running app (curl / Playwright / e2e)     | harness   |
| 6  | Self + hat review  | /code-review + review-* skills            | skill     |
| 7  | Independent review | codex-review → codex exec                 | skill+cli |
| 8  | Push + open PR      | fix-review, ship-feature                  | skill     |
| 9  | Report             | —                                         | inline    |

---

## Step 1 — Parse the goal

From `$ARGUMENTS`, extract (a) the desired outcome and (b) how success is verified. If either is
unclear, ask before building. Restate the goal in one line and the **acceptance check** you will
run against the app (Step 5) before writing any code.

## Step 2 — Isolate (never work on main)

- `git fetch origin`; create a feature branch off the remote tip:
  `git checkout -b <type>/<scope>-<slug> origin/main` (type = feat/fix/security/chore, scope = module).
- Secrets stay in the gitignored `.env` (already present on the dev host — do not commit it).

## Step 3 — Bring up the stack

`docker compose up -d` (Postgres, MinIO, backend, frontend, nginx). After code changes rebuild the
affected service: `docker compose up --build -d backend` (or `frontend`). The app serves at
`http://172.16.45.125:8088` (or `http://localhost:8088`). Wait for `/login` to answer before verifying.

## Step 4 — Implement

Load `work-on-feature` and follow it — respect the modular-monolith layering
(`domain/ → application/ → infrastructure/ → api/`), the ADRs, and the conventions in CLAUDE.md.
Create a Prisma migration for any schema change (never `db push` in a way that skips migrations).

## Step 5 — Verify end-to-end

Mandatory, and the point of the loop: **do not declare success from unit tests alone — exercise the
running app.** Pick what fits the change:

- **HTTP flows:** log in and drive the endpoints with `curl` against `…:8088/api` (mint a token via
  `POST /api/auth/login`), inspecting responses, the DB (`docker exec -it taskmgr_postgres psql …`),
  and `docker logs taskmgr_backend`.
- **UI flows:** if the Playwright MCP tools (`mcp__playwright__*`) are available, click through the
  page; otherwise run the request-based smoke suite in `e2e/` (`cd e2e && BASE_URL=… npx playwright test`)
  and verify the change manually in the browser.
- Walk the exact acceptance check from Step 1. If it fails, fix it (back to Step 4) and re-verify.

## Step 6 — Self review + project hats

- Run `/code-review` on the branch diff for correctness/bugs; apply findings (back to Step 4/5 if a
  fix changes behaviour).
- Apply the applicable project lenses directly — `review-security`, `review-boundaries`,
  `review-comments`, `review-design-system` — on the touched files. Fix every **blocker** (security
  and tenant-isolation findings are non-negotiable).

## Step 7 — Independent Codex review

The independent second-model pass is **mandatory and must never be silently skipped or ignored** —
its outcome is always surfaced in the Step 9 report.

- Run `/codex-review` with a **hard 15-minute cap** (run `codex exec` as a background task, stop it
  at 15 min). On timeout, record **"⚠️ Codex review timed out (>15 min)"** as an IMPORTANT follow-up
  in the report; a timeout does not block the PR but is never swallowed.
- If `codex` is not installed/authenticated, **skip** it but say so explicitly in the report and how
  to enable it (`codex login`). Never treat "Codex absent or slow" as "review passed".
- When Codex returns, address every BLOCKING finding (back to Step 4/5).

Re-run Steps 5–7 until `/code-review` + the hats are clean, the acceptance check still passes, and
Codex is either clean or its timeout/absence is captured.

## Step 8 — Push and open the PR

Configured autonomy: **push + open/update the PR. Do NOT merge** — `/ship-feature` stays a separate
step (the user decides, unless they've told you to merge).

- Commit with a conventional message: `<type>(<scope>): <subject>` ending with the
  `Co-Authored-By: Claude …` trailer.
- Rebase onto the latest base: `git fetch origin` → `git rebase origin/main`; rebuild + re-verify if
  the rebase moved anything.
- Push: `git push -u origin HEAD`. Open/update the PR (reuse the `fix-review` / `ship-feature` gh
  mechanics). Title + body summarize the goal, the verification evidence, and Codex's verdict; end
  the body with the 🤖 Generated with Claude Code line.

## Step 9 — Report and stop

Tell the user:
- **Where to test:** the exact URL + the account/role to log in with, and the precise click/curl path
  for the acceptance check.
- **PR link**, Codex's final verdict (or that it timed out / was unavailable), and the evidence.
- **Skipped or incomplete review steps** — any hat or Codex pass that timed out, was skipped, or could
  not run MUST be listed here as an important follow-up. Never omit it.
- Anything deferred, and any permission that was denied.

**Stopping condition:** acceptance check passes against the app **and** `/code-review` + the hats are
clean **and** Codex is clean *or* its timeout/absence recorded **and** the PR is open → done. If the
goal proves **unattainable**, stop and explain exactly what blocks it and what you tried — do not loop
forever.

## Running it autonomously across turns

For a self-paced loop that re-triggers until the goal is met: `/loop /goal <description>`. This skill
defines the work; `/loop` handles the cadence.
