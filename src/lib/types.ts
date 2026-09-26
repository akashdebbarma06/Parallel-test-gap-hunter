// ─── Supabase table row types ────────────────────────────────────────────────

export type RunStatus = 'running' | 'completed' | 'failed';
export type ModuleStatus = 'pending' | 'running' | 'done' | 'failed';
export type ApprovalStatus = 'pending' | 'approved' | 'edited' | 'rejected';

export interface Run {
  id: string;
  repo_url: string;
  baseline_coverage: number | null;
  final_coverage: number | null;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Module {
  id: string;
  run_id: string;
  path: string;
  status: ModuleStatus;
  files_scanned: number | null;
  completed_at: string | null;
}

export interface Gap {
  id: string;
  module_id: string;
  target: string;
  file: string;
  risk_score: number;
  risk_reasons: string[];
  draft_test: string | null;
  draft_rationale: string | null;
  approval_status: ApprovalStatus;
}

// ─── Subagent return contract (design.md §3) ─────────────────────────────────

export interface GapSummary {
  target: string;
  file: string;
  risk_score: number;
  risk_reasons: string[];
  draft_test: string;
  draft_rationale: string;
}

export interface SubagentSummary {
  module: string;
  gaps: GapSummary[];
  files_scanned: number;
  existing_tests_found: number;
}

// ─── Risk scorer input ────────────────────────────────────────────────────────

export interface RiskParams {
  /** 1 if file changed in last N commits, else 0 */
  recency: number;
  /** 1 if zero test coverage (always 1 when called for an untested item) */
  no_test: number;
  /** number of if/else/switch/catch branches, uncapped */
  complexity_raw: number;
}
