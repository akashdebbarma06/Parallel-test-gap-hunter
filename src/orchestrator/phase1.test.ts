import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBaselinePhase } from './phase1';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../lib/coverage', () => ({
  runCoverage: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  updateRun: vi.fn().mockResolvedValue(undefined),
}));

import { runCoverage } from '../lib/coverage';
import { updateRun } from '../lib/supabase';

const mockRunCoverage = vi.mocked(runCoverage);
const mockUpdateRun = vi.mocked(updateRun);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runBaselinePhase', () => {
  const fakeRun = {
    id: 'run-1',
    repo_url: 'https://github.com/example/repo',
    baseline_coverage: null,
    final_coverage: null,
    summary: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the coverage percentage from runCoverage', async () => {
    mockRunCoverage.mockReturnValue(72.5);

    const result = await runBaselinePhase(fakeRun, '/tmp/repo');

    expect(result).toBe(72.5);
  });

  it('calls updateRun with baseline_coverage from runCoverage', async () => {
    mockRunCoverage.mockReturnValue(72.5);

    await runBaselinePhase(fakeRun, '/tmp/repo');

    expect(mockUpdateRun).toHaveBeenCalledOnce();
    expect(mockUpdateRun).toHaveBeenCalledWith('run-1', {
      baseline_coverage: 72.5,
    });
  });

  it('handles 0% coverage without throwing', async () => {
    mockRunCoverage.mockReturnValue(0);

    await expect(runBaselinePhase(fakeRun, '/tmp/repo')).resolves.toBe(0);
    expect(mockUpdateRun).toHaveBeenCalledWith('run-1', { baseline_coverage: 0 });
  });
});
