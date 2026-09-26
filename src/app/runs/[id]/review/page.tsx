'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, updateGapApproval } from '../../../../lib/supabase';
import { GapCard } from '../../../../components/GapCard';
import type { Gap, ApprovalStatus } from '../../../../lib/types';

interface PageProps {
  params: { id: string };
}

export default function ReviewPage({ params }: PageProps) {
  const runId = params.id;
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('gaps')
        .select('*, modules!inner(run_id)')
        .eq('modules.run_id', runId)
        .order('risk_score', { ascending: false });

      setGaps((data ?? []) as Gap[]);
      setLoading(false);
    }
    load();
  }, [runId]);

  // ── Realtime subscription on gaps ────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`run-gaps-${runId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gaps' },
        (payload) => {
          const updated = payload.new as Gap;
          setGaps((prev) => {
            const idx = prev.findIndex((g) => g.id === updated.id);
            if (idx === -1) return [...prev, updated].sort((a, b) => b.risk_score - a.risk_score);
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  const handleDecision = useCallback(
    async (gapId: string, status: ApprovalStatus) => {
      // Optimistic update
      setGaps((prev) =>
        prev.map((g) => (g.id === gapId ? { ...g, approval_status: status } : g))
      );
      await updateGapApproval(gapId, status);
    },
    []
  );

  const pending = gaps.filter((g) => g.approval_status === 'pending');
  const decided = gaps.filter((g) => g.approval_status !== 'pending');

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="text-gray-500">Loading gaps…</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pending.length} pending · {decided.length} decided
        </p>
      </div>

      {gaps.length === 0 && (
        <p className="text-gray-400">
          No gaps found yet — Phase 2 may still be running.
        </p>
      )}

      {/* Pending gaps */}
      {pending.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Awaiting review
          </h2>
          {pending.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              onApprove={(id) => handleDecision(id, 'approved')}
              onReject={(id) => handleDecision(id, 'rejected')}
            />
          ))}
        </section>
      )}

      {/* Decided gaps */}
      {decided.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Decided
          </h2>
          {decided.map((gap) => (
            <GapCard key={gap.id} gap={gap} />
          ))}
        </section>
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
