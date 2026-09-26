import { NextResponse } from 'next/server';
import { createRun } from '../../../lib/supabase';

/**
 * POST /api/runs
 * Body: { repo_url: string }
 * Returns: { run_id: string }
 *
 * Creates a new run row in Supabase and returns the run ID.
 * Called by the orchestrator to bootstrap a run before spawning subagents.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { repo_url } = body as { repo_url?: string };

  if (!repo_url) {
    return NextResponse.json(
      { error: 'repo_url is required' },
      { status: 400 }
    );
  }

  const run = await createRun(repo_url);

  return NextResponse.json({ run_id: run.id }, { status: 201 });
}
