import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runApprovalGatePhase, formatGapForChat } from './phase3';
import type { Gap, SubagentSummary } from '../lib/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({
  getGapsForRun: vi.fn(),
  updateGapApproval: vi.fn().mockResolvedValue(undefined),
}));

import { getGapsForRun, updateGapApproval } from '../lib/supabase';

const mockGetGaps = vi.mocked(getGapsForRun);
const mockUpdateGapApproval = vi.mocked(updateGapApproval);

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

function makeDbGap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: 'gap-1',
    module_id: 'mod-1',
    target: 'calculateRefund',
    file: 'src/payments/refund.ts',
    risk_score: 0.82,
    risk_reasons: ['changed in last 5 commits', 'no existing test'],
    draft_test: 'it("refunds correctly", () => {})',
    draft_rationale: 'covers the happy path',
    approval_status: 'pending',
    ...overrides,
  };
}

function makeSummary(target = 'calculateRefund', file = 'src/payments/refund.ts'): SubagentSummary {
  return {
    module: 'src/payments',
    gaps: [
      {
        target,
        file,
        risk_score: 0.82,
        risk_reasons: ['changed in last 5 commits'],
        draft_test: 'it("works", () => {})',
        draft_rationale: 'covers happy path',
      },
    ],
    files_scanned: 2,
    existing_tests_found: 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runApprovalGatePhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns approved gaps when chat approves', async () => {
    const dbGap = makeDbGap();
    mockGetGaps.mockResolvedValue([dbGap]);

    const presenter = vi.fn().mockResolvedValue('approved');

    const result = await runApprovalGatePhase(fakeRun, [makeSummary()], presenter);

    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('calculateRefund');
    expect(mockUpdateGapApproval).toHaveBeenCalledWith('gap-1', 'approved');
  });

  it('returns empty array when all gaps are rejected via chat', async () => {
    const dbGap = makeDbGap();
    mockGetGaps.mockResolvedValue([dbGap]);

    const presenter = vi.fn().mockResolvedValue('rejected');

    const result = await runApprovalGatePhase(fakeRun, [makeSummary()], presenter);

    expect(result).toHaveLength(0);
    expect(mockUpdateGapApproval).toHaveBeenCalledWith('gap-1', 'rejected');
  });

  it('skips chat prompt for gaps pre-approved via Supabase dashboard', async () => {
    const dbGap = makeDbGap({ approval_status: 'approved' });
    mockGetGaps.mockResolvedValue([dbGap]);

    const presenter = vi.fn();

    const result = await runApprovalGatePhase(fakeRun, [makeSummary()], presenter);

    // Dashboard already decided → chat presenter should NOT be called
    expect(presenter).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].approval_status).toBe('approved');
  });

  it('skips chat prompt for gaps pre-rejected via Supabase dashboard', async () => {
    const dbGap = makeDbGap({ approval_status: 'rejected' });
    mockGetGaps.mockResolvedValue([dbGap]);

    const presenter = vi.fn();

    const result = await runApprovalGatePhase(fakeRun, [makeSummary()], presenter);

    expect(presenter).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('includes edited gaps in the approved list', async () => {
    const dbGap = makeDbGap({ approval_status: 'edited' });
    mockGetGaps.mockResolvedValue([dbGap]);

    const presenter = vi.fn();

    const result = await runApprovalGatePhase(fakeRun, [makeSummary()], presenter);

    expect(presenter).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('returns empty list when no gaps exist', async () => {
    mockGetGaps.mockResolvedValue([]);

    const presenter = vi.fn();
    const result = await runApprovalGatePhase(fakeRun, [], presenter);

    expect(result).toHaveLength(0);
    expect(presenter).not.toHaveBeenCalled();
  });
});

describe('formatGapForChat', () => {
  it('labels high-risk gaps with HIGH indicator', () => {
    const gap = makeDbGap({ risk_score: 0.9 });
    expect(formatGapForChat(gap)).toContain('HIGH');
  });

  it('labels medium-risk gaps with MEDIUM indicator', () => {
    const gap = makeDbGap({ risk_score: 0.5 });
    expect(formatGapForChat(gap)).toContain('MEDIUM');
  });

  it('labels low-risk gaps with LOW indicator', () => {
    const gap = makeDbGap({ risk_score: 0.2 });
    expect(formatGapForChat(gap)).toContain('LOW');
  });

  it('includes the draft test in the output', () => {
    const gap = makeDbGap({ draft_test: 'it("my test", () => {})' });
    expect(formatGapForChat(gap)).toContain('my test');
  });
});
