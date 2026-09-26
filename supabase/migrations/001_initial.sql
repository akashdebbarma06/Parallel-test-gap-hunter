-- ─── Parallel Test-Gap Hunter — initial schema ───────────────────────────────

-- one row per orchestrator run
create table if not exists runs (
  id               uuid primary key default gen_random_uuid(),
  repo_url         text not null,
  baseline_coverage numeric,
  final_coverage   numeric,
  summary          text,
  started_at       timestamptz default now(),
  completed_at     timestamptz
);

-- one row per subagent module assignment
create table if not exists modules (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references runs(id) on delete cascade,
  path         text not null,
  status       text not null default 'pending', -- pending | running | done | failed
  files_scanned int,
  completed_at timestamptz
);

-- one row per flagged gap
create table if not exists gaps (
  id              uuid primary key default gen_random_uuid(),
  module_id       uuid references modules(id) on delete cascade,
  target          text not null,
  file            text not null,
  risk_score      numeric not null,
  risk_reasons    text[],
  draft_test      text,
  draft_rationale text,
  approval_status text not null default 'pending' -- pending | approved | edited | rejected
);

-- enable realtime for the dashboard
alter publication supabase_realtime add table modules;
alter publication supabase_realtime add table gaps;
