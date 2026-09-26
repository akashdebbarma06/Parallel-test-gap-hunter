'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { CoverageBar } from '../../../../components/CoverageBar';
import { GapCard } from '../../../../components/GapCard';
import type { Run, Gap } from '../../../../lib/types';

interface PageProps {
  params: { id: string };
}

export default function SummaryPage({ params }: PageProps) {
  const runId = params.id;
  const [run, setRun] = useState<Run | null>(null);
  const [approvedGaps, setApprovedGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [runRes, gapsRes] = await Promise.all([
        supabase.from('runs').select('*').eq('id', runId).single(),
        supabase
          .from('gaps')
          .select('*, modules!inner(run_id)')
          .eq('modules.run_id', runId)
          .in('approval_status', ['approved', 'edited'])
          .order('risk_score', { ascending: false }),
      ]);

      if (runRes.data) setRun(runRes.data as Run);
      setApprovedGaps((gapsRes.data ?? []) as Gap[]);
      setLoading(false);
    }
    load();
  }, [runId]);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="text-gray-500">Loading summary…</p>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="text-red-500">Run not found.</p>
      </main>
    );
  }

  const delta =
    run.final_coverage != null && run.baseline_coverage != null
      ? run.final_coverage - run.baseline_coverage
      : null;

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Run Summary</h1>
        <p className="text-sm text-gray-500 mt-1 font-mono truncate">{run.repo_url}</p>
      </div>

      {/* Coverage delta */}
      <section className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Coverage Delta
        </h2>
        <CoverageBar baseline={run.baseline_coverage} final={run.final_coverage} />
        {delta != null && (
          <p className={`text-sm font-medium ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`} from approved tests
          </p>
        )}
      </section>

      {/* AI summary */}
      {run.summary && (
        <section className="border border-gray-200 rounded-lg p-4 bg-white space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            What Changed
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {run.summary}
          </p>
        </section>
      )}

      {/* Approved gaps */}
      {approvedGaps.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {approvedGaps.length} Approved Test{approvedGaps.length !== 1 ? 's' : ''}
          </h2>
          {approvedGaps.map((gap) => (
            <GapCard key={gap.id} gap={gap} />
          ))}
        </section>
      )}

      {run.final_coverage == null && (
        <p className="text-sm text-gray-400 italic">
          Phase 4 (write &amp; re-run) has not completed yet.
        </p>
      )}

      <a
        href={`/runs/${runId}`}
        className="inline-block text-sm text-blue-600 hover:underline"
      >
        ← Back to run
      </a>
    </main>
  );
}
