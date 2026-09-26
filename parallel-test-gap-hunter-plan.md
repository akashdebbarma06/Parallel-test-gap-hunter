# Parallel Test-Gap Hunter — Implementation Plan

## Top-Level Overview

**Goal:** Build a fully working hackathon submission that audits an external TypeScript/Vitest repository for test-coverage gaps in a single parallel Bob subagent pass, ranks each gap by risk, routes draft tests through a dual human-approval gate (Bob chat + Supabase-backed dashboard), and then reports a measurable before/after coverage delta.

**Scope (v1 / 48-hour build):**
- Phase 1: clone the target repo and record baseline Vitest coverage %.
- Phase 2: split repo into module directories, spawn one Bob subagent per module in parallel, collect structured summaries.
- Phase 3: present ranked gaps in both Bob chat AND the Next.js dashboard; either channel can approve/reject each draft test.
- Phase 4: write only approved tests to disk, re-run Vitest, record new coverage % — this phase is intentionally locked until Phase 3 UI is confirmed working.
- Phase 5: AI-generated plain-English summary of the delta.

**Non-scope for this plan:** multi-language support, persistent history across runs, editing draft tests in-app (approve/reject only in v1).

**Target repo:** an external open-source TypeScript/Vitest repo (URL provided by user at run-time). The orchestrator receives the URL as an input parameter.

**Human-gate model:** dual — the orchestrator pauses in Bob chat for per-gap approve/reject AND writes each gap to Supabase in real time; whichever channel fires first for a given gap is accepted as the decision.

---

## Directory Layout (to be created)

```
src/
  orchestrator/        # Bob workflow entry point + phase runners
  subagent/            # per-module subagent task definition and runner
  lib/
    coverage.ts        # deterministic: clone, run vitest --coverage, parse JSON
    module-splitter.ts # split a repo root into module directories
    risk-scorer.ts     # risk_score formula + git recency + complexity
    supabase.ts        # typed Supabase client + helper functions
    types.ts           # shared TypeScript interfaces
  app/                 # Next.js App Router
    runs/[id]/
      page.tsx         # live subagent-status dashboard
      review/
        page.tsx       # human-approval queue
      summary/
        page.tsx       # before/after coverage delta + AI summary
    api/
      runs/            # REST: create run, update gap approval
      realtime/        # (Supabase handles realtime — no custom route needed)
  components/
    ModuleCard.tsx
    GapCard.tsx
    CoverageBar.tsx
supabase/
  migrations/          # SQL for runs, modules, gaps tables
vitest.config.ts
```

---

## Sub-Task 1 — Foundation: Types, Supabase schema, shared lib

**Intent:** Define the canonical data shapes used by every other sub-task. Doing this first ensures no later sub-task invents ad-hoc types or queries the wrong table columns.

**Expected Outcomes:**
- `src/lib/types.ts` exports `Run`, `Module`, `Gap`, `SubagentSummary`, and `ApprovalStatus` TypeScript interfaces that exactly match the Supabase schema from `design.md`.
- `supabase/migrations/001_initial.sql` contains the three CREATE TABLE statements from `design.md` verbatim.
- `src/lib/supabase.ts` exports a typed Supabase client and four helper functions: `createRun`, `upsertModule`, `upsertGap`, `updateGapApproval`.
- `typecheck` passes with zero errors.

**Todo List:**
1. Create `src/lib/types.ts` with TypeScript interfaces matching the three Supabase tables plus the `SubagentSummary` JSON contract from `design.md §3`.
2. Create `supabase/migrations/001_initial.sql` with the exact DDL from `design.md §5`.
3. Create `src/lib/supabase.ts` — instantiate `@supabase/supabase-js` client from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars; export `createRun`, `upsertModule`, `upsertGap`, `updateGapApproval`.
4. Create `.env.local.example` documenting the two required env vars.
5. Run `typecheck` — resolve any errors before marking done.

**Relevant Context:**
- Supabase schema: `design.md §5`
- Subagent return contract: `design.md §3`
- Supabase client package: `@supabase/supabase-js ^2.45.0` already in `package.json`

**Status:** `[ ] pending`

---

## Sub-Task 2 — Phase 1: Baseline Coverage Runner

**Intent:** Implement the deterministic first phase — clone the target repo, run its Vitest suite with the v8 coverage provider, parse the JSON coverage summary, and persist the baseline % to Supabase. This must be pure deterministic logic with no AI involvement.

**Expected Outcomes:**
- `src/lib/coverage.ts` exports `runCoverage(repoPath: string): Promise<number>` — runs `vitest run --coverage --reporter=json` in the target repo directory, reads `coverage/coverage-summary.json`, returns the `total.lines.pct` value.
- `src/orchestrator/phase1.ts` exports `runBaselinePhase(run: Run, repoPath: string): Promise<number>` — calls `runCoverage`, updates the `runs.baseline_coverage` column in Supabase, returns the percentage.
- The function logs to stdout but does NOT throw if coverage is 0 (0% is a valid baseline for an untested repo).
- Unit test in `src/orchestrator/phase1.test.ts` mocks `runCoverage` and verifies that the Supabase update is called with the returned value.

**Todo List:**
1. Create `src/lib/coverage.ts` — use Node `child_process.execSync` to run the vitest coverage command inside `repoPath`; parse the output JSON; return `total.lines.pct`.
2. Create `src/orchestrator/phase1.ts` — call `runCoverage`, call `supabase.updateRun({ baseline_coverage })`, return the number.
3. Create `src/orchestrator/phase1.test.ts` with a single happy-path unit test (mock `execSync` and the Supabase client).
4. Run `vitest run src/orchestrator/phase1.test.ts` — must pass before marking done.

**Relevant Context:**
- Vitest coverage output location: `<repoPath>/coverage/coverage-summary.json` (default v8 path)
- Supabase helper: `src/lib/supabase.ts` (Sub-Task 1)
- `design.md §2` phase 1 description

**Status:** `[ ] pending`

---

## Sub-Task 3 — Module Splitter + Risk Scorer

**Intent:** Implement the two deterministic utilities the orchestrator needs before it can spawn subagents: (a) split a repo root into an ordered list of module directories, and (b) compute a risk score for any given gap using the formula from the PRD.

**Expected Outcomes:**
- `src/lib/module-splitter.ts` exports `splitIntoModules(repoPath: string): string[]` — returns every immediate sub-directory of `src/` (or repo root if no `src/`) that contains at least one `.ts` or `.js` file, sorted alphabetically. Maximum 20 modules (merge smallest dirs if over limit to avoid runaway subagent count).
- `src/lib/risk-scorer.ts` exports `computeRiskScore(params: RiskParams): number` using `risk_score = 0.4 * recency + 0.35 * no_test + 0.25 * complexity`. All three inputs are normalized to [0, 1]. Returns a value in [0, 1] rounded to two decimal places.
- `src/lib/risk-scorer.ts` also exports `getGitRecency(filePath: string, repoPath: string): number` — runs `git log --oneline -5 <file>` and returns 1.0 if the file appears in any of the last 5 commits, 0.0 otherwise.
- Unit tests for both utilities exist and pass.

**Todo List:**
1. Create `src/lib/module-splitter.ts` — use `fs.readdirSync` to list `<repoPath>/src` (fall back to `<repoPath>`); filter to directories that contain `.ts`/`.js` files; cap at 20 by merging smallest-file-count dirs into a single `other` module.
2. Create `src/lib/risk-scorer.ts` — implement `getGitRecency` via `execSync('git log ...')` and `computeRiskScore` with the formula.
3. Create unit tests for both files.
4. Run tests — must pass.

**Relevant Context:**
- Risk formula: `design.md §4` and `prd.md §2`
- Module cap: 20 is chosen to match Bob's subagent concurrency comfort zone for a hackathon demo

**Status:** `[ ] pending`

---

## Sub-Task 4 — Phase 2: Subagent Task Definition + Parallel Fan-Out

**Intent:** Implement the core Bob 2.0 showcase — the orchestrator spawns one subagent per module concurrently. Each subagent reads only its assigned files, cross-references them against existing tests, uses `computeRiskScore` to rank gaps, drafts a candidate test per high-risk gap, and returns a single structured `SubagentSummary` JSON — never raw file contents.

**Expected Outcomes:**
- `src/subagent/task.ts` exports `buildSubagentPrompt(module: { path: string; files: string[]; testFiles: string[] }): string` — produces the exact prompt template (see below) that tells the subagent its scope, what to return, and what NOT to return.
- `src/orchestrator/phase2.ts` exports `runParallelScanPhase(run: Run, repoPath: string, modules: string[]): Promise<SubagentSummary[]>` — calls `spawn_subagent` for each module in a single parallel batch (all calls in one turn), collects results, writes each `SubagentSummary` to Supabase (`upsertModule` + `upsertGap` for every gap), and returns the full array ranked by `risk_score` descending.
- Each gap returned by a subagent has `approval_status: 'pending'` when written to Supabase.
- A Jest/Vitest integration test stubs `spawn_subagent` and asserts that all modules are launched in the same turn (parallel, not sequential).

**Subagent Prompt Template (stored in `src/subagent/task.ts`):**
```
You are a test-gap analysis subagent assigned to module: {{module_path}}.

ASSIGNED FILES (read only these):
{{file_list}}

EXISTING TEST FILES FOR THIS MODULE:
{{test_file_list}}

YOUR TASK:
1. Read every assigned source file.
2. List every exported function or class method that has NO corresponding test in the test files.
3. For each untested item, compute a risk score using:
   risk_score = 0.4 * recency + 0.35 * no_test + 0.25 * complexity
   where recency = 1 if the file was changed in the last 5 git commits, else 0;
   no_test = 1 (always, since we are listing untested items);
   complexity = (number of if/else/switch/catch branches) / 10, capped at 1.
4. For items with risk_score >= 0.6, draft a candidate Vitest test.
5. Return ONLY the following JSON and nothing else — no prose, no file contents:

{
  "module": "{{module_path}}",
  "gaps": [
    {
      "target": "<function or method name>",
      "file": "<relative file path>",
      "risk_score": <number 0-1>,
      "risk_reasons": ["<one reason per factor>"],
      "draft_test": "<full vitest test code or empty string if score < 0.6>",
      "draft_rationale": "<one sentence>"
    }
  ],
  "files_scanned": <number>,
  "existing_tests_found": <number>
}
```

**Todo List:**
1. Create `src/subagent/task.ts` with `buildSubagentPrompt` and the template above.
2. Create `src/orchestrator/phase2.ts` — use `splitIntoModules` to get module paths; for each module glob its `.ts` files and its corresponding `*.test.ts` files; call `buildSubagentPrompt`; spawn all subagents in one parallel batch; await all results; parse each `SubagentSummary`; call `upsertModule` and `upsertGap` per result; return array sorted by max `risk_score` descending.
3. Create integration test for `phase2.ts` with stubbed subagents.
4. Run tests — must pass.

**Relevant Context:**
- `SubagentSummary` type: `src/lib/types.ts` (Sub-Task 1)
- `spawn_subagent` is the Bob 2.0 tool — in production code it is called as a Bob tool; in tests it is mocked.
- `design.md §3` (subagent contract)
- Each subagent must return ONLY the JSON summary — the prompt explicitly forbids raw file content to keep the orchestrator context clean.

**Status:** `[ ] pending`

---

## Sub-Task 5 — Phase 3: Dual Human-Approval Gate

**Intent:** Implement the hard stop between gap discovery and test-writing. The orchestrator presents the ranked gaps in the Bob chat panel AND writes them to Supabase so the dashboard review page can also accept decisions. Whichever channel fires first for a given gap is accepted.

**Expected Outcomes:**
- `src/orchestrator/phase3.ts` exports `runApprovalGatePhase(run: Run, summaries: SubagentSummary[]): Promise<Gap[]>` — presents each gap to the user via Bob's `ask_followup_question` tool (one question per gap: approve / edit / reject), simultaneously polling Supabase for dashboard-side decisions (a gap is considered decided if its `approval_status` in Supabase is no longer `pending`). Returns only the `approved` and `edited` gaps.
- The function must never proceed past a gap until EITHER the chat response OR the Supabase row has a non-pending status — this is the hard stop guarantee.
- Dashboard review page (`src/app/runs/[id]/review/page.tsx`) uses a Supabase realtime subscription on the `gaps` table for the given `run_id` and calls `updateGapApproval` on approve/reject button press.
- `GapCard.tsx` component renders: gap target, file, risk score (with colour coding: red ≥ 0.7, amber 0.4–0.69, green < 0.4), risk reasons, draft test in a syntax-highlighted code block, and Approve / Reject buttons.
- A unit test verifies that a gap pre-approved via Supabase is NOT re-presented in the Bob chat flow.

**Todo List:**
1. Create `src/orchestrator/phase3.ts` — loop through gaps sorted by risk_score desc; for each gap: check Supabase status first (skip if already decided); present via `ask_followup_question` with approve/edit/reject options; write decision back to Supabase; collect approved + edited items; return them.
2. Create `src/app/runs/[id]/review/page.tsx` with a Supabase realtime subscription; render one `GapCard` per gap; wire approve/reject to `updateGapApproval`.
3. Create `src/components/GapCard.tsx` with risk-colour coding and draft test display.
4. Unit test for `phase3.ts` — verify Supabase-pre-approved gaps are skipped in chat.
5. Run tests — must pass.

**Relevant Context:**
- Dual-gate design decision from this planning session: chat + dashboard, first-wins per gap.
- `updateGapApproval`: `src/lib/supabase.ts` (Sub-Task 1)
- This sub-task must be confirmed working by the user BEFORE Sub-Task 7 (Phase 4 / writing tests) is started — per the user's explicit requirement.

**Status:** `[ ] pending`

---

## Sub-Task 6 — Live Dashboard: Runs + Module-Status Pages

**Intent:** Implement the parallel-progress visualization pages that make the hackathon demo visually compelling — module cards transitioning `pending → running → done` in real time, mirroring Bob's own subagent panel.

**Expected Outcomes:**
- `src/app/runs/[id]/page.tsx` renders a grid of `ModuleCard` components, one per module row in Supabase. Subscribes to realtime updates on the `modules` table filtered by `run_id`; cards animate status transitions.
- `src/components/ModuleCard.tsx` shows: module path, status badge (pending/running/done/failed), file count, gap count (populated after subagent completes).
- `src/components/CoverageBar.tsx` shows a before/after horizontal bar (before = baseline_coverage, after = final_coverage or "--" while pending).
- `src/app/api/runs/route.ts` — POST handler that creates a new run row in Supabase and returns `{ run_id }`. Used by the orchestrator to bootstrap a run.

**Todo List:**
1. Create `src/app/runs/[id]/page.tsx` with realtime subscription on `modules`.
2. Create `src/components/ModuleCard.tsx`.
3. Create `src/components/CoverageBar.tsx`.
4. Create `src/app/api/runs/route.ts` POST handler.
5. Run `typecheck` — must pass.

**Relevant Context:**
- Supabase realtime subscriptions: `@supabase/supabase-js` `.channel().on('postgres_changes', ...)` API.
- No custom websocket server is needed — Supabase handles realtime.
- `design.md §6` dashboard spec.

**Status:** `[ ] pending`

---

## Sub-Task 7 — Phase 4: Write Approved Tests + Re-run Coverage

**Intent:** The deterministic write phase. Only approved/edited tests reach disk. After writing, re-run Vitest coverage in the target repo, record the new %, and update Supabase.

**LOCKED:** This sub-task must NOT be started until the user has confirmed Phase 3 (Sub-Task 5) is working correctly.

**Expected Outcomes:**
- `src/orchestrator/phase4.ts` exports `runWritePhase(run: Run, approvedGaps: Gap[], repoPath: string): Promise<number>` — for each approved gap, writes `gap.draft_test` to `<repoPath>/<gap.file>.test.ts` (creating file if it doesn't exist, appending if it does); calls `runCoverage(repoPath)` for the new %; updates `runs.final_coverage` in Supabase; returns the new %.
- No test is written for any gap with `approval_status !== 'approved' && !== 'edited'`.
- A unit test verifies that a rejected gap produces no file write.

**Todo List:**
1. Create `src/orchestrator/phase4.ts` — write each approved gap's `draft_test` to the correct path; call `runCoverage`; update Supabase; return new %.
2. Unit test for `phase4.ts` — stub `fs.writeFileSync` and `runCoverage`; assert rejected gaps produce no write call.
3. Run tests — must pass.
4. **Gate check:** confirm with user that Phase 3 review UI is working before merging/running this sub-task.

**Relevant Context:**
- `runCoverage`: `src/lib/coverage.ts` (Sub-Task 2)
- `updateGapApproval` and `updateRun`: `src/lib/supabase.ts`
- User's explicit instruction: "Do not implement phase 4 until I've confirmed the human-gate UI in phase 3 is working correctly."

**Status:** `[ ] pending`

---

## Sub-Task 8 — Phase 5: AI Summary + Final Dashboard Page

**Intent:** Close the loop with a plain-English summary of what changed, why each approved test matters, and the coverage delta. Populate the `/runs/[id]/summary` page.

**Expected Outcomes:**
- `src/orchestrator/phase5.ts` exports `runSummaryPhase(run: Run, approvedGaps: Gap[], baselinePct: number, finalPct: number): Promise<string>` — prompts the orchestrator (Bob) to generate a 3–5 sentence summary; stores it in a new `summary` text column on `runs`; returns the string.
- `src/app/runs/[id]/summary/page.tsx` renders the `CoverageBar` (before → after), the AI summary text, and a table of approved gaps with their rationales.
- `runs` table migration adds a `summary text` column (new migration file `002_add_summary.sql`).

**Todo List:**
1. Create `supabase/migrations/002_add_summary.sql` — `ALTER TABLE runs ADD COLUMN summary text`.
2. Update `src/lib/types.ts` `Run` interface to include `summary?: string`.
3. Update `src/lib/supabase.ts` to add `updateRunSummary(runId, summary)` helper.
4. Create `src/orchestrator/phase5.ts`.
5. Create `src/app/runs/[id]/summary/page.tsx`.
6. Run `typecheck` — must pass.

**Relevant Context:**
- `design.md §6` summary page spec.
- The AI summary is generated by the orchestrator (Bob) itself using its own language capabilities — no external LLM API call needed.

**Status:** `[ ] pending`

---

## Sub-Task 9 — Orchestrator Entry Point + Bob Workflow Wiring

**Intent:** Wire all five phases into a single callable Bob Workflow so the demo can be triggered with one command. The orchestrator is the top-level script that calls phases 1–5 in order and handles the phase-3 gate.

**Expected Outcomes:**
- `src/orchestrator/index.ts` exports `runOrchestrator(repoUrl: string): Promise<void>` — clones the repo to a temp directory, calls phases 1 → 2 → 3 → 4 (if gate passed) → 5 in sequence, logs a brief summary to stdout after each phase.
- `bobignore` is updated so that coverage artifacts and cloned repo temp dirs are excluded from Bob's context.
- A top-level `README.md` documents: prerequisites, env var setup, how to run the orchestrator, and how to view the dashboard.

**Todo List:**
1. Create `src/orchestrator/index.ts` — sequence phases 1–5 with the phase-3 gate.
2. Update `bobignore` to exclude `tmp/`, `coverage/`, `node_modules/`, `.next/`.
3. Create `README.md` with setup and usage instructions.
4. Run `typecheck` and `lint` — must pass.

**Relevant Context:**
- All phase runners: Sub-Tasks 2–5, 7–8.
- `bobignore` already exists in the project root.

**Status:** `[ ] pending`

---

## Sub-Task 10 — End-to-End Smoke Test + Demo Validation

**Intent:** Run a full end-to-end pass against the chosen open-source TypeScript repo to validate that all five phases produce real, non-empty output before the hackathon demo recording.

**Expected Outcomes:**
- Phase 1 returns a non-null baseline coverage %.
- Phase 2 returns at least one gap from at least one module.
- Phase 3 gate pauses correctly and accepts a decision from either channel.
- Phase 4 writes at least one test file and the new coverage % differs from baseline.
- Phase 5 returns a non-empty summary string.
- The dashboard shows realtime module-card transitions during Phase 2.

**Todo List:**
1. Choose the target demo repo URL (confirm with user).
2. Run `src/orchestrator/index.ts` against the target repo.
3. Capture before/after coverage numbers and record them.
4. Verify dashboard realtime transitions in the browser during the run.
5. Fix any integration bugs found.
6. Note the measured "time saved" number (actual tool runtime vs. estimated manual audit time).

**Relevant Context:**
- User confirmed: external open-source TypeScript/Vitest repo; URL to be provided.
- This sub-task is the final validation gate before the hackathon submission.

**Status:** `[ ] pending`

---

## Implementation Order

```
Sub-Task 1 (foundation types + Supabase)
    ↓
Sub-Task 2 (Phase 1 coverage runner)   Sub-Task 3 (module splitter + risk scorer)
    ↓                                       ↓
              Sub-Task 4 (Phase 2 subagent fan-out)
                          ↓
              Sub-Task 5 (Phase 3 dual approval gate)  ←── USER CONFIRMS GATE WORKING
              Sub-Task 6 (live dashboard pages)
                          ↓
              Sub-Task 7 (Phase 4 write + re-run)      ←── LOCKED UNTIL GATE CONFIRMED
                          ↓
              Sub-Task 8 (Phase 5 AI summary)
                          ↓
              Sub-Task 9 (orchestrator entry point + wiring)
                          ↓
              Sub-Task 10 (end-to-end smoke test)
```

Sub-Tasks 2 and 3 can proceed in parallel after Sub-Task 1 is complete.
Sub-Tasks 5 and 6 can proceed in parallel after Sub-Task 4 is complete.
