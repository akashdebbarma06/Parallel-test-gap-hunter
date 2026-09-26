import { updateRun } from '../lib/supabase';
import type { Run, Gap } from '../lib/types';

/**
 * Phase 5 — AI plain-English summary.
 *
 * Produces a 3–5 sentence plain-English description of:
 *   - How many gaps were found and approved
 *   - Which modules had the highest-risk gaps
 *   - The coverage delta
 *   - Why the approved tests matter
 *
 * The summary is persisted to Supabase and returned.
 *
 * In the real Bob workflow this function is called by the orchestrator after
 * the Bob agent has already collected context (approved gaps, coverage numbers).
 * The `summaryText` parameter receives the AI-generated text produced upstream
 * by the orchestrator's own language capabilities — this function just persists
 * and returns it.
 */
export async function runSummaryPhase(
  run: Run,
  approvedGaps: Gap[],
  baselinePct: number,
  finalPct: number,
  /** Pre-generated summary text from the Bob orchestrator */
  summaryText?: string
): Promise<string> {
  const delta = finalPct - baselinePct;
  const deltaStr =
    delta > 0
      ? `+${delta.toFixed(1)}%`
      : delta < 0
        ? `${delta.toFixed(1)}%`
        : 'no change';

  // If no summary was passed in (e.g. during testing), generate a deterministic
  // fallback so the dashboard always has something to show.
  const text =
    summaryText ??
    buildFallbackSummary(approvedGaps, baselinePct, finalPct, deltaStr);

  await updateRun(run.id, { summary: text });

  console.log(`[Phase 5] Summary written (${text.length} chars). Coverage: ${baselinePct.toFixed(1)}% → ${finalPct.toFixed(1)}% (${deltaStr}).`);

  return text;
}

// ─── Fallback (deterministic) summary ────────────────────────────────────────

function buildFallbackSummary(
  approvedGaps: Gap[],
  baseline: number,
  final: number,
  deltaStr: string
): string {
  if (approvedGaps.length === 0) {
    return (
      `No test gaps were approved in this run. ` +
      `Baseline coverage remains at ${baseline.toFixed(1)}%.`
    );
  }

  const topGap = approvedGaps[0];
  const uniqueFiles = [...new Set(approvedGaps.map((g) => g.file))];
  const fileWord = uniqueFiles.length === 1 ? 'file' : 'files';

  return (
    `${approvedGaps.length} test gap${approvedGaps.length > 1 ? 's' : ''} were approved ` +
    `across ${uniqueFiles.length} ${fileWord}. ` +
    `Coverage moved from ${baseline.toFixed(1)}% to ${final.toFixed(1)}% (${deltaStr}). ` +
    `The highest-risk gap was \`${topGap.target}\` in \`${topGap.file}\` ` +
    `(risk score ${topGap.risk_score}) — ${topGap.draft_rationale ?? 'no rationale provided'}. ` +
    `All tests were reviewed and explicitly approved before being written to disk.`
  );
}
