import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { runParallelScanPhase, parseSubagentOutput } from './phase2';
import type { SubagentSummary } from '../lib/types';

// ─── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock('../lib/module-splitter', () => ({
  splitIntoModules: vi.fn(),
  collectSourceFiles: vi.fn().mockReturnValue([]),
  collectTestFiles: vi.fn().mockReturnValue([]),
  countSourceFiles: vi.fn().mockReturnValue(2),
}));

vi.mock('../lib/supabase', () => ({
  upsertModule: vi.fn().mockResolvedValue({ id: 'mod-1', status: 'done' }),
  upsertGap: vi.fn().mockResolvedValue({}),
}));

import { splitIntoModules } from '../lib/module-splitter';
import { upsertModule, upsertGap } from '../lib/supabase';

const mockSplit = vi.mocked(splitIntoModules);
const mockUpsertModule = vi.mocked(upsertModule);
const mockUpsertGap = vi.mocked(upsertGap);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeRun = {
  id: 'run-1',
  repo_url: 'https://github.com/example/repo',
  baseline_coverage: null,
  final_coverage: null,
  summary: null,
  started_at: new Date().toISOString(),
  completed_at: null,
};

function makeSummary(modulePath: string, riskScore = 0.8): SubagentSummary {
  return {
    module: modulePath,
    gaps: [
      {
        target: 'myFunction',
        file: `${modulePath}/index.ts`,
        risk_score: riskScore,
        risk_reasons: ['changed in last 5 commits', 'no existing test'],
        draft_test: 'it("works", () => { expect(myFunction()).toBe(true); })',
        draft_rationale: 'covers the happy path',
      },
    ],
    files_scanned: 2,
    existing_tests_found: 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runParallelScanPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: two modules
    mockSplit.mockReturnValue(['/repo/src/auth', '/repo/src/payments']);
    mockUpsertModule.mockResolvedValue({ id: 'mod-1', status: 'done' } as never);
  });

  it('launches all subagents in the same parallel batch (Promise.all)', async () => {
    const callOrder: number[] = [];
    let resolveA!: (v: string) => void;
    let resolveB!: (v: string) => void;

    const runners = [
      () =>
        new Promise<string>((res) => {
          callOrder.push(0);
          resolveA = res;
        }),
      () =>
        new Promise<string>((res) => {
          callOrder.push(1);
          resolveB = res;
        }),
    ];

    let callIdx = 0;
    const parallelRunner = async (_desc: string) => {
      const fn = runners[callIdx++];
      return fn();
    };

    const runPromise = runParallelScanPhase(fakeRun, '/repo', parallelRunner);

    // Both subagents should have been started before either resolves
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder).toEqual([0, 1]); // both were called

    // Now resolve both
    resolveA(JSON.stringify(makeSummary('src/auth')));
    resolveB(JSON.stringify(makeSummary('src/payments')));

    const result = await runPromise;
    expect(result.summaries).toHaveLength(2);
  });

  it('writes each gap to Supabase via upsertGap', async () => {
    const runner = async (_d: string) =>
      JSON.stringify(makeSummary('src/auth'));

    mockSplit.mockReturnValue(['/repo/src/auth']);
    await runParallelScanPhase(fakeRun, '/repo', runner);

    expect(mockUpsertGap).toHaveBeenCalledOnce();
    expect(mockUpsertGap.mock.calls[0][1]).toMatchObject({
      target: 'myFunction',
      risk_score: 0.8,
    });
  });

  it('marks a failed module as "failed" in Supabase and continues', async () => {
    const runner = async (_d: string) => {
      throw new Error('subagent exploded');
    };

    mockSplit.mockReturnValue(['/repo/src/auth']);
    const result = await runParallelScanPhase(fakeRun, '/repo', runner);

    expect(result.summaries[0].gaps).toHaveLength(0);
    // Use path.join so the assertion works on both Windows (\) and POSIX (/)
    const authRel = path.join('src', 'auth');
    expect(mockUpsertModule).toHaveBeenCalledWith(
      'run-1',
      authRel,
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('sorts returned summaries by highest gap risk_score descending', async () => {
    mockSplit.mockReturnValue(['/repo/src/auth', '/repo/src/payments']);

    let call = 0;
    const runner = async (_d: string) => {
      const score = call++ === 0 ? 0.5 : 0.9;
      return JSON.stringify(makeSummary(call === 1 ? 'src/auth' : 'src/payments', score));
    };

    const result = await runParallelScanPhase(fakeRun, '/repo', runner);
    expect(result.summaries[0].gaps[0].risk_score).toBeGreaterThanOrEqual(
      result.summaries[1].gaps[0]?.risk_score ?? 0
    );
  });
});

describe('parseSubagentOutput', () => {
  it('parses clean JSON', () => {
    const summary = makeSummary('src/auth');
    const result = parseSubagentOutput(JSON.stringify(summary), 'src/auth');
    expect(result.module).toBe('src/auth');
    expect(result.gaps).toHaveLength(1);
  });

  it('strips markdown code fences', () => {
    const summary = makeSummary('src/auth');
    const wrapped = '```json\n' + JSON.stringify(summary) + '\n```';
    const result = parseSubagentOutput(wrapped, 'src/auth');
    expect(result.module).toBe('src/auth');
  });

  it('throws on non-JSON output', () => {
    expect(() => parseSubagentOutput('Sorry, I cannot help.', 'src/auth')).toThrow(
      'non-JSON'
    );
  });

  it('throws when required fields are missing', () => {
    expect(() =>
      parseSubagentOutput(JSON.stringify({ module: 'x' }), 'x')
    ).toThrow('missing required fields');
  });
});
