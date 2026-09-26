# Parallel Test-Gap Hunter — Technical Design

## 1. Architecture Overview

```
                        ┌─────────────────────────┐
                        │   Orchestrator (Bob)     │
                        │   Plan mode → Agent mode │
                        └───────────┬──────────────┘
                                    │ splits repo into modules
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
             │ Subagent A  │ │ Subagent B  │ │ Subagent C  │   ← run in parallel,
             │ (module 1)  │ │ (module 2)  │ │ (module N)  │     isolated context each
             └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                    │  structured summary only (no raw file dumps)
                    └───────────────┼───────────────┘
                                    ▼
                        ┌─────────────────────────┐
                        │  Orchestrator: rank      │
                        │  gaps by risk, draft     │
                        │  candidate tests         │
                        └───────────┬──────────────┘
                                    ▼
                        ┌─────────────────────────┐
                        │  Human approval gate     │  ← interactive workflow step
                        │  (approve/edit/reject)   │
                        └───────────┬──────────────┘
                                    ▼
                 ┌──────────────────────────────────┐
                 │ Deterministic: write approved     │
                 │ tests, re-run suite, diff coverage│
                 └───────────────┬────────────────────┘
                                    ▼
                        ┌─────────────────────────┐
                        │  AI: plain-English        │
                        │  summary of impact        │
                        └─────────────────────────┘
```

## 2. Workflow Definition

A single Bob 2.0 Workflow mixing deterministic, AI-driven, and human-gated steps:

1. **[deterministic]** Run existing test suite → capture baseline coverage %
2. **[AI, parallel]** Split repo into modules → spawn one subagent per module → each subagent scans for untested logic, ranks by risk, drafts candidate tests → returns structured summary
3. **[human gate]** Present ranked gaps + draft tests in the review queue; developer approves, edits, or rejects each
4. **[deterministic]** Write approved tests to disk → re-run suite → capture new coverage %
5. **[AI]** Generate plain-English summary of what changed, why, and the coverage delta

Steps 1 and 4 are intentionally deterministic (no model variance in measuring coverage). Steps 2 and 5 are AI-driven. Step 3 is a hard stop — nothing proceeds to step 4 without explicit human approval per item.

## 3. Subagent Contract

Each per-module subagent receives a scoped task description (assigned directory/files only) and returns a single structured summary — never raw file contents — to keep the orchestrator's context clean:

```json
{
  "module": "src/lib/payments",
  "gaps": [
    {
      "target": "calculateRefund()",
      "file": "src/lib/payments/refund.ts",
      "risk_score": 0.82,
      "risk_reasons": ["changed in last 5 commits", "no existing test", "3 branching error paths"],
      "draft_test": "<candidate test code>",
      "draft_rationale": "covers negative-amount and currency-mismatch edge cases"
    }
  ],
  "files_scanned": 6,
  "existing_tests_found": 2
}
```

## 4. Risk-Ranking Heuristic (kept simple and explainable)

```
risk_score = 0.4 * (recency_weight)      // changed in last N commits
           + 0.35 * (no_test_weight)     // 1 if zero coverage, else 0
           + 0.25 * (complexity_weight)  // normalized cyclomatic complexity
```

Deliberately linear and inspectable — the demo should be able to point at any flagged gap and explain its score in one sentence.

## 5. Data Model (Supabase / Postgres)

```sql
-- one row per hackathon demo run
create table runs (
  id uuid primary key default gen_random_uuid(),
  repo_url text not null,
  baseline_coverage numeric,
  final_coverage numeric,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- one row per subagent's module assignment
create table modules (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id),
  path text not null,
  status text default 'pending', -- pending | running | done | failed
  files_scanned int,
  completed_at timestamptz
);

-- one row per flagged gap
create table gaps (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references modules(id),
  target text not null,
  file text not null,
  risk_score numeric not null,
  risk_reasons text[],
  draft_test text,
  draft_rationale text,
  approval_status text default 'pending' -- pending | approved | edited | rejected
);
```

## 6. Dashboard (Next.js + TypeScript + Supabase)

- `/runs/[id]` — live view of the orchestrator run: module cards transitioning pending → running → done, mirroring Bob's own parallel-subagent panel
- `/runs/[id]/review` — the human-approval queue: one card per gap, showing risk reasons and the draft test, with approve / edit / reject actions
- `/runs/[id]/summary` — before/after coverage numbers plus the AI-generated plain-English summary

Realtime updates via Supabase subscriptions on `modules` and `gaps` so the dashboard reflects subagent progress live during the demo recording.

## 7. Tech Stack

- **Frontend/dashboard:** Next.js (App Router), React, TypeScript
- **Data/state:** Supabase (Postgres + realtime subscriptions)
- **Test runner (demo repo dependent):** Vitest or the demo repo's existing framework
- **Coverage:** v8 coverage provider (or repo's existing tool) for before/after numbers
- **Orchestration:** IBM Bob 2.0 (Plan mode for scoping, Agent mode for execution, Workflows for the phased pipeline, subagents for the parallel module scan)
