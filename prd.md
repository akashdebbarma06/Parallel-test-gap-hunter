# Parallel Test-Gap Hunter — Product Requirements Document

**Event:** IBM Bob 2.0 Hackathon (LabLab.ai)
**Track:** Developer workflow improvement — Testing
**Team:** Solo build

---

## 1. Problem Statement

Untested logic accumulates silently in every fast-moving codebase. Developers rarely audit test coverage module-by-module because it's slow, tedious, and easy to defer — so gaps are usually discovered in production, not in review. There is currently no fast way to answer "what, specifically, is untested and how risky is it?" across an entire repository at once.

**Time/effort/error cost today:** a manual coverage audit of a mid-sized repo (20–30 files) typically takes a developer several hours of sequential, module-by-module review — and even then, risk isn't prioritized, so low-value tests often get written before high-risk gaps.

## 2. Goal

Reduce a multi-hour, sequential test-coverage audit to a single automated pass that:
1. Scans every module of a repository **in parallel**, not sequentially
2. Ranks untested logic by **risk**, not just by presence/absence of tests
3. Drafts candidate tests for the highest-risk gaps
4. Routes those drafts through a **human-approval gate** before anything is written or run
5. Reports a measurable before/after coverage delta and time saved

## 3. Non-Goals

- Not a general-purpose test-writing tool for greenfield code (targets *existing, undertested* codebases)
- Not a CI/CD replacement — this is an audit-and-draft tool, not a deployment gate
- No support (v1) for languages beyond the demo repo's primary stack
- No autonomous test-writing without human approval — this is intentional, not a limitation

## 4. Target User

A developer or team lead inheriting or maintaining a codebase who needs to quickly understand test-coverage risk without reading every file themselves.

## 5. User Stories

- As a developer, I can point the tool at a repo and see coverage gaps ranked by risk within minutes, not hours.
- As a developer, I can see *why* a gap is flagged as high-risk (recently changed, complex, error-prone) rather than a bare list of untested lines.
- As a reviewer, I can approve, edit, or reject each drafted test before it touches the codebase.
- As a team lead, I can see a coverage delta (before → after) and a plain-English summary of what changed.

## 6. Success Metrics (Hackathon Demo)

| Metric | Before | After |
|---|---|---|
| Coverage % on demo repo | baseline run | post-approval run |
| Time to audit repo | manual estimate (hours) | tool runtime (minutes) |
| High-risk gaps surfaced | 0 (unknown) | ranked list with rationale |
| Tests written without review | N/A | 0 — every test passes the human gate |

## 7. Scope for the 48-Hour Build

**In scope:**
- Orchestrator agent that splits a repo into modules and fans out subagents in parallel
- Per-module subagent: reads code, cross-references existing tests, flags gaps, drafts candidate tests
- Simple, explainable risk-ranking heuristic (recency of change + complexity + absence of tests)
- Human-approval gate (review queue: approve / edit / reject per drafted test)
- Deterministic before/after coverage run
- Minimal dashboard to visualize subagents running in parallel and the resulting coverage delta

**Explicitly deferred if time runs short:**
- Editing drafted tests in-app (fallback: approve/reject only)
- Multi-language support beyond the demo repo
- Persisted history across multiple runs

## 8. IBM Bob 2.0 Feature Mapping

| Bob 2.0 Feature | Where it's used | Why it matters for this problem |
|---|---|---|
| **Subagents** | One spawned per module/directory, isolated context | Each module is explored independently without polluting a shared context with dozens of intermediate file reads |
| **Parallel tool calling** | All module subagents run concurrently | Turns a sequential multi-hour audit into a single parallel pass |
| **Document understanding** | Cross-referencing existing test files against source logic | Lets a subagent reason about *what's missing*, not just what exists |
| **Workflow (deterministic + AI + human gate)** | Baseline run → parallel scan → human approval → write & re-run → summary | Keeps AI-drafted output supervised and auditable rather than autonomous |
| **Plan → Agent mode** | Plan mode scopes each subagent's task before execution | Matches Bob 2.0's intended usage pattern; reduces wasted/incorrect runs |

## 9. Risks

- Risk-ranking heuristic must stay simple enough to explain in a 10-second demo beat — an opaque scoring model undermines the "impact" story.
- Drafted tests must be genuinely useful, not filler generated to inflate a coverage number — quality is judged, not just percentage.
