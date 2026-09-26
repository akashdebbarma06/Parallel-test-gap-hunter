import { createClient } from '@supabase/supabase-js';
import type { Run, Module, Gap, ApprovalStatus } from './types';

// ─── Client ──────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a new run row and return it. */
export async function createRun(repoUrl: string): Promise<Run> {
  const { data, error } = await supabase
    .from('runs')
    .insert({ repo_url: repoUrl })
    .select()
    .single();
  if (error) throw new Error(`createRun: ${error.message}`);
  return data as Run;
}

/** Insert or update a module row. Returns the upserted row. */
export async function upsertModule(
  runId: string,
  path: string,
  fields: Partial<Omit<Module, 'id' | 'run_id' | 'path'>> = {}
): Promise<Module> {
  const { data, error } = await supabase
    .from('modules')
    .upsert({ run_id: runId, path, ...fields }, { onConflict: 'run_id,path' })
    .select()
    .single();
  if (error) throw new Error(`upsertModule(${path}): ${error.message}`);
  return data as Module;
}

/** Insert or update a gap row. Returns the upserted row. */
export async function upsertGap(
  moduleId: string,
  fields: Omit<Gap, 'id' | 'module_id' | 'approval_status'>
): Promise<Gap> {
  const { data, error } = await supabase
    .from('gaps')
    .upsert(
      { module_id: moduleId, ...fields, approval_status: 'pending' },
      { onConflict: 'module_id,target,file' }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertGap(${fields.target}): ${error.message}`);
  return data as Gap;
}

/** Update the approval_status of a single gap. */
export async function updateGapApproval(
  gapId: string,
  status: ApprovalStatus
): Promise<void> {
  const { error } = await supabase
    .from('gaps')
    .update({ approval_status: status })
    .eq('id', gapId);
  if (error) throw new Error(`updateGapApproval(${gapId}): ${error.message}`);
}

/** Update a run's baseline or final coverage and/or completed_at. */
export async function updateRun(
  runId: string,
  fields: Partial<Pick<Run, 'baseline_coverage' | 'final_coverage' | 'summary' | 'completed_at'>>
): Promise<void> {
  const { error } = await supabase.from('runs').update(fields).eq('id', runId);
  if (error) throw new Error(`updateRun(${runId}): ${error.message}`);
}

/** Fetch all gaps for a run (joined via modules). Sorted by risk_score desc. */
export async function getGapsForRun(runId: string): Promise<Gap[]> {
  const { data, error } = await supabase
    .from('gaps')
    .select('*, modules!inner(run_id)')
    .eq('modules.run_id', runId)
    .order('risk_score', { ascending: false });
  if (error) throw new Error(`getGapsForRun(${runId}): ${error.message}`);
  return (data ?? []) as Gap[];
}
