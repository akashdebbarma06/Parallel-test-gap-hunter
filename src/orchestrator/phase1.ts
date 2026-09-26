import { runCoverage } from '../lib/coverage';
import { updateRun } from '../lib/supabase';
import type { Run } from '../lib/types';

/**
 * Phase 1 — Deterministic baseline coverage run.
 *
 * Runs the existing test suite in `repoPath` with Vitest + v8 coverage,
 * records the baseline line-coverage % in Supabase, and returns the number.
 */
export async function runBaselinePhase(
  run: Run,
  repoPath: string
): Promise<number> {
  console.log(`[Phase 1] Running baseline coverage in ${repoPath} …`);

  const pct = runCoverage(repoPath);

  console.log(`[Phase 1] Baseline coverage: ${pct.toFixed(1)}%`);

  await updateRun(run.id, { baseline_coverage: pct });

  return pct;
}
