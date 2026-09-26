import * as path from 'path';
import { splitIntoModules, collectSourceFiles, collectTestFiles } from '../lib/module-splitter';
import { buildSubagentPrompt } from '../subagent/task';
import { upsertModule, upsertGap } from '../lib/supabase';
import type { Run, Module, SubagentSummary, GapSummary } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseResult {
  summaries: SubagentSummary[];
  modules: Module[];
}

// ─── Subagent runner (swappable for tests) ────────────────────────────────────

/**
 * In production this is Bob's spawn_subagent tool.
 * In tests it is replaced with a mock via dependency injection.
 */
export type SubagentRunner = (description: string) => Promise<string>;

// Default runner — calls Bob's built-in spawn_subagent.
// The actual spawn_subagent tool is invoked by the Bob orchestrator at
// runtime; this function signature matches what phase2 expects.
export async function defaultSubagentRunner(description: string): Promise<string> {
  // In the real Bob workflow context, spawn_subagent is available as a
  // global tool.  We call it by constructing the request the same way
  // the orchestrator would.
  // This file is imported and the runner is overridden by the Bob workflow
  // entry point (src/orchestrator/index.ts) before calling runParallelScanPhase.
  throw new Error(
    'defaultSubagentRunner must be replaced with the spawn_subagent tool ' +
      'binding before calling runParallelScanPhase. ' +
      `Received prompt (${description.length} chars) — not executed.`
  );
}

// ─── Phase 2 ─────────────────────────────────────────────────────────────────

/**
 * Phase 2 — Parallel subagent fan-out.
 *
 * Splits `repoPath` into modules, spawns one subagent per module
 * concurrently (all in a single parallel batch), collects structured
 * SubagentSummary results, writes them to Supabase, and returns the
 * full array sorted by max risk_score descending.
 */
export async function runParallelScanPhase(
  run: Run,
  repoPath: string,
  runnerOverride?: SubagentRunner
): Promise<PhaseResult> {
  const runner = runnerOverride ?? defaultSubagentRunner;

  console.log(`[Phase 2] Splitting ${repoPath} into modules …`);
  const moduleDirs = splitIntoModules(repoPath);
  console.log(`[Phase 2] ${moduleDirs.length} module(s) found — spawning subagents in parallel …`);

  // Mark all modules as 'pending' in Supabase immediately so the
  // dashboard shows the full list before subagents start.
  const moduleRows = await Promise.all(
    moduleDirs.map((dir) =>
      upsertModule(run.id, path.relative(repoPath, dir), { status: 'pending' })
    )
  );

  // ─── Build prompts and mark each module as 'running' ─────────────────────
  const promptsWithMeta = moduleDirs.map((dir, i) => {
    const rel = path.relative(repoPath, dir);
    const allFiles = collectSourceFiles(dir);
    const testFiles = collectTestFiles(dir);
    // Express file paths relative to repo root
    const relFiles = allFiles.map((f) => path.relative(repoPath, f));
    const relTests = testFiles.map((f) => path.relative(repoPath, f));

    const prompt = buildSubagentPrompt({
      modulePath: rel,
      files: relFiles,
      testFiles: relTests,
      repoRoot: repoPath,
    });

    return { dir, rel, moduleRow: moduleRows[i], prompt };
  });

  // Mark all as running (parallel — fire-and-forget Supabase updates)
  await Promise.all(
    promptsWithMeta.map(({ rel }) =>
      upsertModule(run.id, rel, { status: 'running' })
    )
  );

  // ─── Spawn ALL subagents concurrently (the core Bob 2.0 parallel call) ───
  const subagentPromises = promptsWithMeta.map(async ({ rel, moduleRow, prompt }) => {
    try {
      const raw = await runner(prompt);
      const summary = parseSubagentOutput(raw, rel);

      // Persist results to Supabase
      const updatedModule = await upsertModule(run.id, rel, {
        status: 'done',
        files_scanned: summary.files_scanned,
        completed_at: new Date().toISOString(),
      });

      await Promise.all(
        summary.gaps.map((gap: GapSummary) =>
          upsertGap(updatedModule.id, {
            target: gap.target,
            file: gap.file,
            risk_score: gap.risk_score,
            risk_reasons: gap.risk_reasons,
            draft_test: gap.draft_test,
            draft_rationale: gap.draft_rationale,
          })
        )
      );

      console.log(
        `[Phase 2] ✓ ${rel} — ${summary.gaps.length} gap(s), ` +
          `${summary.files_scanned} file(s) scanned`
      );

      return { summary, module: updatedModule };
    } catch (err) {
      console.error(`[Phase 2] ✗ ${rel} failed: ${String(err)}`);
      await upsertModule(run.id, rel, { status: 'failed' });
      // Return a minimal summary so the orchestrator can continue
      const emptySummary: SubagentSummary = {
        module: rel,
        gaps: [],
        files_scanned: 0,
        existing_tests_found: 0,
      };
      return { summary: emptySummary, module: moduleRow };
    }
  });

  const results = await Promise.all(subagentPromises);

  // Sort summaries by the highest gap risk_score in each module (desc)
  const summaries = results
    .map((r) => r.summary)
    .sort((a, b) => maxRisk(b) - maxRisk(a));

  const modules = results.map((r) => r.module);

  console.log(
    `[Phase 2] Complete — ${summaries.reduce((n, s) => n + s.gaps.length, 0)} total gap(s) across ${summaries.length} module(s)`
  );

  return { summaries, modules };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maxRisk(s: SubagentSummary): number {
  return s.gaps.reduce((max, g) => Math.max(max, g.risk_score), 0);
}

/**
 * Parse the subagent's raw text output into a SubagentSummary.
 * Handles subagents that wrap JSON in markdown fences.
 */
export function parseSubagentOutput(raw: string, modulePath: string): SubagentSummary {
  // Strip markdown code fences if the subagent wrapped the JSON
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Subagent for module "${modulePath}" returned non-JSON output.\n` +
        `First 200 chars: ${raw.slice(0, 200)}`
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.module || !Array.isArray(obj.gaps)) {
    throw new Error(
      `Subagent output for "${modulePath}" missing required fields "module" or "gaps".`
    );
  }

  return obj as unknown as SubagentSummary;
}
