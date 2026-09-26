import { getGapsForRun, updateGapApproval } from '../lib/supabase';
import type { Run, Gap, ApprovalStatus, SubagentSummary } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Single-item approval decision from either channel */
export interface GapDecision {
  gapId: string;
  status: ApprovalStatus;
  /** The (possibly edited) draft test code — only set for 'edited' decisions */
  editedTest?: string;
}

/**
 * Presenter function injected at runtime.
 * In production this is Bob's ask_followup_question tool; in tests it's mocked.
 * Returns 'approved' | 'rejected' (edit is handled via the dashboard channel).
 */
export type ChatPresenter = (gap: Gap) => Promise<'approved' | 'rejected'>;

// ─── Phase 3 ─────────────────────────────────────────────────────────────────

/**
 * Phase 3 — Dual human-approval gate.
 *
 * For every gap (sorted by risk_score desc), checks whether a dashboard
 * decision has already arrived in Supabase. If it has, skips the chat
 * prompt for that gap. Otherwise, presents the gap in the Bob chat panel
 * and waits for an approve/reject response.
 *
 * A gap is included in the returned array only if its final status is
 * 'approved' or 'edited'.
 *
 * This is a HARD STOP — nothing in phase 4 should run until this function
 * returns.
 */
export async function runApprovalGatePhase(
  run: Run,
  summaries: SubagentSummary[],
  presenter: ChatPresenter
): Promise<Gap[]> {
  // Flatten all gaps, sorted by risk_score desc
  const allGaps = summaries
    .flatMap((s) => s.gaps)
    .sort((a, b) => b.risk_score - a.risk_score);

  if (allGaps.length === 0) {
    console.log('[Phase 3] No gaps to review.');
    return [];
  }

  console.log(`[Phase 3] ${allGaps.length} gap(s) to review. Starting approval gate …`);

  // Fetch the current Supabase state for all gaps in this run
  const dbGaps = await getGapsForRun(run.id);
  const gapById = new Map(dbGaps.map((g) => [g.id, g]));

  const approved: Gap[] = [];

  for (const gapSummary of allGaps) {
    // Look up the persisted gap by target + file (subagents return summaries,
    // not DB UUIDs — we match on the natural key)
    const dbGap = dbGaps.find(
      (g) => g.target === gapSummary.target && g.file === gapSummary.file
    );

    if (!dbGap) {
      // Gap hasn't been written to Supabase yet — skip (shouldn't happen
      // after phase 2 completes, but be defensive)
      console.warn(`[Phase 3] Gap "${gapSummary.target}" not found in DB — skipping.`);
      continue;
    }

    // ── Check if dashboard already decided this gap ───────────────────────
    const currentStatus = gapById.get(dbGap.id)?.approval_status ?? 'pending';

    if (currentStatus === 'approved' || currentStatus === 'edited') {
      console.log(`[Phase 3] ✓ "${dbGap.target}" already approved via dashboard — skipping chat prompt.`);
      approved.push(dbGap);
      continue;
    }

    if (currentStatus === 'rejected') {
      console.log(`[Phase 3] ✗ "${dbGap.target}" already rejected via dashboard — skipping.`);
      continue;
    }

    // ── Present in Bob chat and wait for decision ─────────────────────────
    console.log(
      `[Phase 3] Presenting gap: "${dbGap.target}" in ${dbGap.file} ` +
        `(risk: ${dbGap.risk_score})`
    );

    const chatDecision = await presenter(dbGap);

    // Write the chat decision to Supabase so the dashboard stays in sync
    await updateGapApproval(dbGap.id, chatDecision);

    if (chatDecision === 'approved') {
      approved.push({ ...dbGap, approval_status: 'approved' });
      console.log(`[Phase 3] ✓ "${dbGap.target}" approved via chat.`);
    } else {
      console.log(`[Phase 3] ✗ "${dbGap.target}" rejected via chat.`);
    }
  }

  console.log(
    `[Phase 3] Gate complete — ${approved.length}/${allGaps.length} gap(s) approved.`
  );

  return approved;
}

// ─── Default presenter (Bob chat) ────────────────────────────────────────────

/**
 * Formats a gap for display in the Bob chat approval prompt.
 * Returns a multi-line string that the orchestrator can pass to
 * ask_followup_question / equivalent.
 */
export function formatGapForChat(gap: Gap): string {
  const riskLabel =
    gap.risk_score >= 0.7 ? '🔴 HIGH' : gap.risk_score >= 0.4 ? '🟡 MEDIUM' : '🟢 LOW';

  const lines = [
    `**Gap: \`${gap.target}\`** — \`${gap.file}\``,
    `Risk: ${riskLabel} (${gap.risk_score})`,
    `Why: ${gap.risk_reasons.join(' · ')}`,
    '',
    gap.draft_test
      ? `**Draft test:**\n\`\`\`typescript\n${gap.draft_test}\n\`\`\``
      : '*(No draft test — risk score below threshold)*',
    '',
    `_${gap.draft_rationale}_`,
    '',
    'Approve this draft test?',
  ];

  return lines.join('\n');
}
