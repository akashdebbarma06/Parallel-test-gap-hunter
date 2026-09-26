import { execSync } from 'child_process';
import type { RiskParams } from './types';

/**
 * Compute the risk score for an untested code item.
 *
 *   risk_score = 0.4 * recency + 0.35 * no_test + 0.25 * complexity
 *
 * All inputs are normalized to [0, 1]; result is rounded to 2 decimal places.
 */
export function computeRiskScore(params: RiskParams): number {
  const { recency, no_test, complexity_raw } = params;
  // Normalize complexity: cap at 10 branches → complexity = 1.0
  const complexity = Math.min(complexity_raw / 10, 1);
  const score = 0.4 * recency + 0.35 * no_test + 0.25 * complexity;
  return Math.round(score * 100) / 100;
}

/**
 * Return 1 if `filePath` (relative or absolute) appears in any of the last
 * `lookback` commits in the git repo at `repoPath`, otherwise 0.
 */
export function getGitRecency(
  filePath: string,
  repoPath: string,
  lookback = 5
): number {
  try {
    const output = execSync(`git log --oneline -${lookback} -- "${filePath}"`, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
      .toString()
      .trim();
    return output.length > 0 ? 1 : 0;
  } catch {
    // git not available or file not tracked — treat as not recently changed
    return 0;
  }
}

/**
 * Estimate cyclomatic complexity by counting control-flow branches in source.
 * This is a lightweight static approximation — not a full AST walk.
 */
export function estimateComplexity(sourceCode: string): number {
  const branchPattern =
    /\b(if|else if|else|switch|case|catch|for|while|do|\?\s*:)\b/g;
  return (sourceCode.match(branchPattern) ?? []).length;
}
