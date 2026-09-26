'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ModuleCard } from '../../../components/ModuleCard';
import { CoverageBar } from '../../../components/CoverageBar';
import type { Run, Module } from '../../../lib/types';

interface PageProps {
  params: { id: string };
}

export default function RunPage({ params }: PageProps) {
  const runId = params.id;
  const [run, setRun] = useState<Run | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [runRes, modulesRes] = await Promise.all([
        supabase.from('runs').select('*').eq('id', runId).single(),
        supabase
          .from('modules')
          .select('*')
          .eq('run_id', runId)
          .order('path'),
      ]);

      if (runRes.data) setRun(runRes.data as Run);
      if (modulesRes.data) setModules(modulesRes.data as Module[]);
      setLoading(false);
    }
    load();
  }, [runId]);

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`run-modules-${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'modules',
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const updated = payload.new as Module;
          setModules((prev) => {
            const idx = prev.findIndex((m) => m.id === updated.id);
            if (idx === -1) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'runs',
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          setRun((prev) =>
            prev ? { ...prev, ...(payload.new as Partial<Run>) } : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-gray-500">Loading run…</p>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-red-500">Run not found.</p>
      </main>
    );
  }

  const done = modules.filter((m) => m.status === 'done').length;
  const total = modules.length;

  return (
    <main className="max-w-4xl mx-auto p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test-Gap Hunter</h1>
        <p className="mt-1 text-sm text-gray-500 font-mono truncate">{run.repo_url}</p>
      </div>

      {/* Coverage bar */}
      <CoverageBar baseline={run.baseline_coverage} final={run.final_coverage} />

      {/* Progress */}
      <p className="text-sm text-gray-600">
        Subagents: <span className="font-semibold">{done}/{total}</span> complete
      </p>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modules.map((m) => (
          <ModuleCard key={m.id} module={m} />
        ))}
        {modules.length === 0 && (
          <p className="text-gray-400 text-sm col-span-2">
            No modules yet — waiting for Phase 2 to start.
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-4 pt-2">
        <a
          href={`/runs/${runId}/review`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          → Review gaps
        </a>
        <a
          href={`/runs/${runId}/summary`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          → View summary
        </a>
      </div>
    </main>
  );
}
