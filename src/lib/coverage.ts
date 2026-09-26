import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run Vitest with the v8 coverage provider inside `repoPath` and return the
 * total line-coverage percentage (0–100).
 *
 * Expects the target repo to have `vitest` in its devDependencies and a
 * `vitest.config.*` that sets `coverage.provider = 'v8'`.
 */
export function runCoverage(repoPath: string): number {
  // Run coverage — suppress stdout noise but let stderr surface on failure
  try {
    execSync('npx vitest run --coverage --reporter=json', {
      cwd: repoPath,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 120_000,
    });
  } catch (err: unknown) {
    // vitest exits non-zero when tests fail; we still want the coverage report
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
        : '';
    if (!stderr.includes('Coverage report generated')) {
      // Coverage output wasn't produced — propagate the error
      throw new Error(`vitest coverage run failed in ${repoPath}:\n${stderr}`);
    }
  }

  const summaryPath = path.join(repoPath, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(
      `Coverage summary not found at ${summaryPath}. ` +
        'Ensure the target repo has @vitest/coverage-v8 installed and ' +
        'coverage.reporter includes "json-summary".'
    );
  }

  const raw = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<
    string,
    { lines: { pct: number } }
  >;

  return raw?.total?.lines?.pct ?? 0;
}
