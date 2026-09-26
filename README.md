# Parallel Test-Gap Hunter

**IBM Bob 2.0 Hackathon** · Track: Developer Workflow Improvement — Testing

Audits an entire TypeScript repository for test-coverage gaps in a single parallel subagent pass, ranks each gap by risk, routes draft tests through a human-approval gate (Bob chat + live dashboard), and reports a measurable before/after coverage delta.

---

## Prerequisites

- Node.js ≥ 18.18
- A Supabase project ([create one free at supabase.com](https://supabase.com))
- IBM Bob 2.0 (for the orchestrator workflow)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Copy `.env.local.example` to `.env.local` and fill in your Supabase project credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run the Supabase migrations

In the Supabase SQL Editor, run:

```sql
-- From supabase/migrations/001_initial.sql
-- then supabase/migrations/002_add_summary.sql
```

Or use the Supabase CLI:

```bash
supabase db push
```

---

## Running the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running the Orchestrator (via Bob 2.0)

The orchestrator is wired to run as a Bob 2.0 workflow. In the Bob chat panel:

1. Point it at the target repo URL.
2. Bob spawns one subagent per module directory — all concurrently.
3. The **Phase 3 gate** pauses execution. Review gaps in:
   - The **Bob chat panel** (approve / reject each gap inline), or
   - The **dashboard** at `/runs/[id]/review` — first channel wins per gap.
4. After approval, Phase 4 writes only the approved tests to the target repo and re-runs coverage.
5. The final delta and AI summary appear at `/runs/[id]/summary`.

---

## Project Structure

```
src/
  orchestrator/       Phase runners (phase1–5) + entry point
  subagent/           Subagent prompt template
  lib/
    types.ts          Canonical TypeScript interfaces
    supabase.ts       Typed Supabase client + helpers
    coverage.ts       Deterministic: run vitest, parse JSON
    module-splitter.ts  Split repo into module directories
    risk-scorer.ts    Risk score formula + git recency
  app/
    runs/[id]/           Live subagent-status dashboard
    runs/[id]/review/    Human-approval queue
    runs/[id]/summary/   Before/after coverage + AI summary
    api/runs/            POST to create a run row
  components/
    ModuleCard.tsx  GapCard.tsx  CoverageBar.tsx
supabase/migrations/    SQL schema
```

---

## Risk Score Formula

```
risk_score = 0.4 × recency
           + 0.35 × no_test
           + 0.25 × complexity

recency    = 1 if file changed in last 5 commits, else 0
no_test    = 1 (always, for untested items)
complexity = branch count / 10, capped at 1
```

Gaps with `risk_score ≥ 0.6` get a drafted candidate test. All drafts require explicit human approval before touching disk.

---

## Running Tests

```bash
npm test                 # run all unit tests
npm run test:coverage    # run with coverage report
npm run typecheck        # TypeScript strict check
```

---

## Bob 2.0 Features Used

| Feature | Where |
|---|---|
| **Subagents** | One per module directory, isolated context |
| **Parallel tool calling** | All subagents launched concurrently (Phase 2) |
| **Document understanding** | Each subagent reasons about *missing* tests, not just present ones |
| **Human-in-the-loop gate** | Phase 3 — hard stop before any test is written to disk |
| **Plan → Agent mode** | Plan mode scoped the task; Agent mode executed it |
| **Workflows** | Deterministic + AI + human-gate pipeline in a single run |
