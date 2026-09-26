import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { createRun } from '../lib/supabase';
import { runBaselinePhase } from './phase1';
import { runParallelScanPhase, type SubagentRunner } from './phase2';
import { runApprovalGatePhase, formatGapForChat, type ChatPresenter } from './phase3';
import { runWritePhase } from './phase4';
import { runSummaryPhase } from './phase5';
import type { Gap } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  /**
   * The Bob 2.0 spawn_subagent tool binding.
   * Injected by the Bob workflow at runtime; receives a prompt string and
   * returns the subagent's raw text output (must be the SubagentSummary JSON).
   */
  subagentRunner: SubagentRunner;

  /**
   * The Bob 2.0 ask_followup_question / chat-approval binding.
   * Injected at runtime; receives a formatted gap description and returns
   * 'approved' or 'rejected'.
   */
  chatPresenter: ChatPresenter;

  /**
   * Optional: pre-generated AI summary text for Phase 5.
   * If omitted, a deterministic fallback summary is used.
   */
  aiSummaryText?: string;

  /**
   * Set to true only after you have manually verified that the Phase 3
   * dashboard review UI is working. Phase 4 (writing tests to disk) will
   * not proceed until this flag is true.
   *
   * Default: false (Phase 4 is locked by default).
   */
  phase4Confirmed?: boolean;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Main orchestrator entry point.
 *
 * Runs the full 5-phase pipeline:
 *   1. Clone target repo → run baseline coverage
 *   2. Parallel subagent fan-out (one per module)
 *   3. Human-approval gate (dual: chat + dashboard)
 *   4. Write approved tests → re-run coverage  [LOCKED until phase4Confirmed]
 *   5. AI plain-English summary
 */
export async function runOrchestrator(
  repoUrl: string,
  options: OrchestratorOptions
): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Parallel Test-Gap Hunter  v0.1.0   ║');
  console.log('║   IBM Bob 2.0 Hackathon              ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`Target repo: ${repoUrl}`);
  console.log('');

  // ── Bootstrap Supabase run row ────────────────────────────────────────────
  console.log('[Orchestrator] Creating run …');
  const run = await createRun(repoUrl);
  console.log(`[Orchestrator] Run ID: ${run.id}`);
  console.log(`[Orchestrator] Dashboard: /runs/${run.id}`);
  console.log('');

  // ── Clone repo to a temp directory ───────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gap-repo-'));
  console.log(`[Orchestrator] Cloning ${repoUrl} → ${tmpDir} …`);
  execSync(`git clone --depth=1 "${repoUrl}" "${tmpDir}"`, { stdio: 'inherit' });

  // Install deps in the target repo so vitest can run
  console.log('[Orchestrator] Installing dependencies in target repo …');
  execSync('npm install', { cwd: tmpDir, stdio: 'inherit' });
  console.log('');

  try {
    // ── Phase 1: Baseline coverage ──────────────────────────────────────────
    console.log('── PHASE 1: Baseline Coverage ─────────────────────────────');
    const baselinePct = await runBaselinePhase(run, tmpDir);
    console.log('');

    // ── Phase 2: Parallel subagent fan-out ──────────────────────────────────
    console.log('── PHASE 2: Parallel Subagent Scan ────────────────────────');
    const { summaries } = await runParallelScanPhase(run, tmpDir, options.subagentRunner);
    console.log('');

    // ── Phase 3: Human-approval gate (HARD STOP) ────────────────────────────
    console.log('── PHASE 3: Human Approval Gate ───────────────────────────');
    console.log('[Phase 3] Review queue: /runs/' + run.id + '/review');
    console.log('[Phase 3] Approve via chat below OR via dashboard — first wins.\n');

    const approvedGaps: Gap[] = await runApprovalGatePhase(
      run,
      summaries,
      options.chatPresenter
    );
    console.log('');

    // ── Phase 4: Write approved tests (LOCKED until confirmed) ──────────────
    let finalPct = baselinePct;

    if (!options.phase4Confirmed) {
      console.log('── PHASE 4: LOCKED ─────────────────────────────────────────');
      console.log('[Phase 4] Skipped — phase4Confirmed is false.');
      console.log('[Phase 4] Set phase4Confirmed: true in OrchestratorOptions once');
      console.log('[Phase 4] you have verified the Phase 3 review UI is working.');
      console.log('');
    } else {
      console.log('── PHASE 4: Write Approved Tests ───────────────────────────');
      finalPct = await runWritePhase(run, approvedGaps, tmpDir);
      console.log('');
    }

    // ── Phase 5: AI summary ──────────────────────────────────────────────────
    console.log('── PHASE 5: Summary ────────────────────────────────────────');
    const summary = await runSummaryPhase(
      run,
      approvedGaps,
      baselinePct,
      finalPct,
      options.aiSummaryText
    );
    console.log('');
    console.log('Summary:');
    console.log(summary);
    console.log('');
    console.log(`Dashboard: /runs/${run.id}/summary`);
    console.log('');
    console.log('✓ Orchestrator complete.');

  } finally {
    // Clean up the cloned repo
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Chat presenter helper (re-exported for use in Bob workflow glue) ─────────
export { formatGapForChat };
