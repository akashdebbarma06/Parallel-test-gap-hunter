import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { runWritePhase } from './phase4';
import type { Gap, Run } from '../lib/types';

vi.mock('../lib/coverage', () => ({
  runCoverage: vi.fn().mockReturnValue(85.0),
}));

vi.mock('../lib/supabase', () => ({
  updateRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { runCoverage } from '../lib/coverage';
import { updateRun } from '../lib/supabase';

const mockRunCoverage = vi.mocked(runCoverage);
const mockUpdateRun = vi.mocked(updateRun);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockAppendFileSync = vi.mocked(fs.appendFileSync);

const fakeRun: Run = {
  id: 'run-1',
  repo_url: 'https://github.com/example/repo',
  baseline_coverage: 65,
  final_coverage: null,
  summary: null,
  started_at: new Date().toISOString(),
  completed_at: null,
};

function makeGap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: 'gap-1',
    module_id: 'mod-1',
    target: 'charge',
    file: 'src/payments/charge.ts',
    risk_score: 0.9,
    risk_reasons: ['recently changed'],
    draft_test: 'it("charges correctly", () => {})',
    draft_rationale: 'covers happy path',
    approval_status: 'approved',
    ...overrides,
  };
}

describe('runWritePhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('writes a new test file for an approved gap', async () => {
    await runWritePhase(fakeRun, [makeGap()], '/repo');
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync.mock.calls[0][0]).toContain('charge.test.ts');
  });

  it('appends to an existing test file', async () => {
    mockExistsSync.mockReturnValue(true);
    await runWritePhase(fakeRun, [makeGap()], '/repo');
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('does NOT write files for rejected gaps', async () => {
    const rejected = makeGap({ approval_status: 'rejected' });
    await runWritePhase(fakeRun, [rejected], '/repo');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('calls updateRun with final_coverage after writing', async () => {
    await runWritePhase(fakeRun, [makeGap()], '/repo');
    expect(mockUpdateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ final_coverage: 85.0 })
    );
  });

  it('still re-runs coverage and updates Supabase when there are no gaps', async () => {
    await runWritePhase(fakeRun, [], '/repo');
    expect(mockRunCoverage).toHaveBeenCalledOnce();
    expect(mockUpdateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ final_coverage: 85.0 })
    );
  });
});
