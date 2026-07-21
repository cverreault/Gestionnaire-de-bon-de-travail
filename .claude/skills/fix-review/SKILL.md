---
name: fix-review
description: Fetch PR review feedback, triage findings, apply selected fixes, push, and show the diff. Run this as many times as needed before /ship-feature.
argument-hint: <pr-number>
disable-model-invocation: true
allowed-tools: Bash(gh *) Bash(git *) Read Edit Write Grep Glob
---

> **Used by `/goal`** (pipeline step 7). Changing this skill? Reconcile the pipeline table in `.claude/skills/goal/SKILL.md`.

# Fix Review Feedback

You are addressing review feedback on pull request **#$ARGUMENTS**.

This skill can be run **multiple times** — once per review round. It applies fixes and pushes but does NOT merge, clean up, or close anything. Use `/ship-feature` when the PR is ready to merge.

Follow every step below in order. Do NOT skip steps.

**Important:** If any tool or permission is denied, do NOT silently skip the step. Surface the blocker clearly so the user can grant the permission and you can retry.

---

## Step 1 — Gather PR context

Fetch the PR and its review state:

```
gh pr view $ARGUMENTS --json title,body,author,state,baseRefName,headRefName,mergeStateStatus,mergeable,isDraft
gh pr checks $ARGUMENTS
```

Extract:
- The PR's head branch name (e.g., `security/b26-ssrf-2fa-lockout`) and the commit **scope** (module name) it maps to.
- The merge state and CI status.
- The local git worktree path for that branch, if any, via `git worktree list --porcelain`.

**Abort if:**
- The PR is already merged or closed.
- The PR is a draft (suggest the user un-draft it first).

## Step 2 — Fetch all unresolved review feedback

Collect review comments from both surfaces:

```
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews --jq '.[] | {id, state, body, author: .user.login, submitted_at}'
gh api graphql -f query='query { repository(owner:"OWNER", name:"REPO") { pullRequest(number:$ARGUMENTS) { reviewThreads(first:100) { nodes { isResolved isOutdated path line body: comments(first:10) { nodes { body author { login } } } } } } } }'
```

(Use `gh repo view --json owner,name` to resolve OWNER/REPO.)

Keep only:
- Unresolved review threads (`isResolved = false`).
- Non-outdated threads, unless the finding still applies to current code.
- The top-level review bodies (the overall review comment).

Discard:
- Resolved threads.
- Praise / purely positive comments that don't request action.

**If there are no actionable findings**, report that and stop — nothing to fix.

## Step 3 — Parse findings into a triage list

From the collected feedback, extract each actionable finding as:

| # | Category | File:Line | Summary |
|---|----------|-----------|---------|
| 1 | blocker/suggestion/nitpick | `path/to/file.ts:42` | one-line summary |

**Category rules:**
- **Blocker** — reviewer marked as blocking, or requested-changes review, or finding implies security/correctness bug.
- **Suggestion** — non-blocking improvement, reviewer would prefer it done.
- **Nitpick** — style, naming, minor refactor, optional.
- **Out-of-repo** — action needed elsewhere (another repo, an infra change, a follow-up task). Track separately.

## Step 4 — Present grouped triage options

Do NOT walk through findings one-by-one. Present 3-4 grouped options based on the finding mix:

**Grouping heuristic:**
- Option A: **Quick wins only** — all blockers + nitpicks (they're fast and uncontroversial).
- Option B: **All code fixes** — blockers + suggestions + nitpicks, excluding out-of-repo items.
- Option C: **Blockers only** — minimum to unblock merge.
- Option D: **Custom** — user picks individually.

Always list out-of-repo items separately — they become follow-up notes, not PR commits.

Example output:

```
Review on PR #$ARGUMENTS has 5 findings:

  [B1] file.ts:12    — description         (blocker)
  [S1] other.ts:34   — description         (suggestion)
  [S2] third.ts:56   — description         (suggestion)
  [N1] fourth.ts:78  — description         (nitpick)
  [O1] (follow-up)   — description         (out-of-repo)

Suggested groupings:
  A) Quick wins: [B1, N1] — defer [S1, S2] to follow-up, note [O1] separately
  B) All code fixes: [B1, S1, S2, N1] — note [O1] separately
  C) Blockers only: [B1] — defer rest
  D) Custom: pick individually

Choose [A/B/C/D]:
```

Wait for the user's choice.

## Step 5 — Apply the selected fixes

For each accepted finding, in the order listed:

1. Navigate to the PR's worktree (from Step 1).
2. Make the fix.
3. Commit it as its own atomic commit with message:
   `fix(<scope>): address review — {short-summary}` (scope = module name, conventional commits)
4. Reply to the review thread via `gh api` on `/repos/{owner}/{repo}/pulls/comments/{comment_id}/replies` with: `Applied in <sha>.`

For each rejected finding, reply on the thread with: `Not applying: <reason>.`

For each deferred finding, reply: `Deferred to follow-up (will track as a new card).`

For each out-of-repo item, record it in a **follow-up list** to present at the end. Do NOT auto-create anything — the user decides what to do with them.

**Never mark your own review threads as resolved.** The reviewer resolves them after re-reading.

## Step 6 — Push and wait for CI

```
git push
gh pr checks $ARGUMENTS --watch
```

If any check fails:
- Investigate the failure.
- Fix the underlying issue (go back to Step 5 for the fix).
- Push and re-watch.

## Step 7 — Report back

Show ONLY the new commits added during this session (not the full PR diff, which the user already reviewed):

```
git log main..HEAD --oneline
git diff main...HEAD -- <files-changed-in-step-5>
```

Present to the user:

```
Applied N fixes on PR #$ARGUMENTS:

  <sha1> fix(work-orders): address review — short summary 1
  <sha2> fix(work-orders): address review — short summary 2
  ...

Deferred findings: [list, if any]
Out-of-repo follow-ups: [list, if any]

CI status: [green/yellow/red]
Ready to ship? Run /ship-feature $ARGUMENTS
```
