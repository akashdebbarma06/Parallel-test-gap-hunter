export default function HomePage() {
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">Parallel Test-Gap Hunter</h1>
      <p className="text-gray-600">
        An IBM Bob 2.0 hackathon tool that audits a TypeScript repository for
        test-coverage gaps in a single parallel subagent pass, ranks each gap
        by risk, and routes draft tests through a human-approval gate before
        writing anything to disk.
      </p>
      <p className="text-sm text-gray-400">
        Run the orchestrator from your terminal to start a new audit run.
        Your run dashboard will appear at{' '}
        <code className="font-mono">/runs/[id]</code>.
      </p>
    </main>
  );
}
