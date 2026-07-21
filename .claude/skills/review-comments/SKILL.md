---
name: review-comments
description: Review hat — enforces comments & writing discipline. Flags comments that restate what the code does, banner/dead comments, signature-restating doc blocks, and documentation that duplicates information. A code-review lens for TaskMgr.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(git *)
---

# Comments & documentation review hat

**Applies when:** `**/*`

Review the diff ONLY through the comments/writing lens. Guiding principle: a comment earns its
place by explaining a non-obvious **why**, not by narrating **what** the code already says.
Code language is English ([CLAUDE.md](../../../CLAUDE.md) conventions).

## Flag (with `file:line`)

- **What-comments** — any comment that restates what the code already says. The fix is to
  delete it (or, if the code is unclear, rename/extract instead of commenting). **blocker** when
  pervasive in the diff.
- **Banner / section-divider comments** used as narration inside a function (`// ==== Setup ====`).
  A method that needs section headers is too long — flag to split. (Module-level file-section
  dividers between top-level members are fine.) **warn**.
- **Commented-out code.** Delete it; git remembers. **blocker**.
- **Signature-restating doc blocks** (`/** Gets the user id. */` on `getUserId()`). Drop unless
  they document a contract/exception/unit/edge case. **warn**.
- **Redundant parentheticals** and filler in prose / UI strings / error messages. **nit**.
- **Documentation duplication** — a new/changed `.md` (or doc block) that repeats information
  already in code, an ADR, a module spec (`docs/modules/`), or CLAUDE.md. Point at the canonical
  source and flag the duplicate for removal or a link. **warn**.

## Don't flag

- Comments explaining a non-obvious **why** (workaround, constraint, invariant, security reason),
  ADR/issue links, sharp-edge warnings, or public-API/JSDoc that adds information beyond the
  signature.

## Report

Return each finding as `file:line — issue — fix`, with severity. If the diff is clean on this
lens, say so.
