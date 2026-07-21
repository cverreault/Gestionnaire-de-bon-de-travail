---
name: codex-review
description: Independent code review by OpenAI Codex (a different model) on the current branch diff. Runs `codex exec` read-only and returns a structured verdict — APPROVED or blocking findings. Use standalone, or as step 8 of /goal.
argument-hint: [base-ref — defaults to origin/main]
disable-model-invocation: true
allowed-tools: Bash(codex *) Bash(git *) Read Grep Glob
---

> **Used by `/goal`** (pipeline step 7). Changing this skill? Reconcile the pipeline table in `.claude/skills/goal/SKILL.md`.

# Codex Review

Get an **independent** review from OpenAI Codex — a different model that catches bugs Claude's
self-review misses. Codex runs non-interactively and read-only; this skill hands its verdict
back to you (or to `/goal`) to act on. It does **not** apply fixes.

**Prerequisite:** `codex` installed and authenticated (`codex login`). If `codex exec` fails
with an auth error, stop and tell the user to run `codex login` — do not silently skip.

Follow every step in order.

## Step 1 — Resolve the base and the diff

- Base ref = `$ARGUMENTS` if given, else `origin/main`. Run `git fetch origin` first.
- Confirm there is something to review: `git diff --stat <base>...HEAD`. If empty, report
  "nothing to review" and stop.

## Step 2 — Run Codex (read-only, hooks off)

Run from the repo / worktree root:

```
codex exec -s read-only -c features.hooks=false "$(cat <<'PROMPT'
You are an INDEPENDENT senior reviewer. Review ONLY the changes on this branch versus the base.

1. Run: git diff <BASE>...HEAD   (the read-only sandbox allows reads and running git)
2. Read CLAUDE.md and the ADRs under docs/adrs/ it points to — the change MUST obey them
   (tenant isolation, no cross-module imports, @Roles on every route, i18nValidationMessage in DTOs,
   Prisma migrations, no PII in logs, etc.).
3. Apply the project review lenses in .claude/skills/review-*/SKILL.md (security, boundaries,
   comments, design-system) as an independent second opinion.
4. Prioritise correctness / security / tenant-isolation bugs, then convention violations.

Output EXACTLY one of:
  APPROVED
or a markdown list of BLOCKING findings, one per line:
  - <file>:<line> — <problem> — <concrete fix>
No praise, no non-blocking nitpicks. Be terse.
PROMPT
)" < /dev/null
```

Substitute `<BASE>` with the resolved base ref. Flag notes for the current CLI (`codex-cli`
0.142.x): `codex exec` is **non-interactive by default** — do **not** pass `--ask-for-approval`
(removed; it now errors with `unexpected argument`). `-s read-only` (short for `--sandbox`) keeps
Codex from writing; `-c features.hooks=false` stops its Stop hooks from kicking off a full build
on a read-only review; the trailing `< /dev/null` is required so `codex exec` doesn't hang reading
stdin (it will otherwise block on "Reading additional input from stdin…").

## Step 3 — Parse the verdict

- Output is `APPROVED` with nothing actionable → verdict **APPROVED**.
- Otherwise collect the findings into a triage table (same shape as `/fix-review`):

  | # | File:Line | Problem | Suggested fix |

## Step 4 — Report / hand back

- **Standalone:** present the verdict + findings table and stop. The user decides what to fix.
- **Called by `/goal`:** return the verdict + findings so the loop addresses every BLOCKING
  finding and re-runs until APPROVED.

Never apply fixes in this skill — it only reviews. Fixes belong to the caller.
