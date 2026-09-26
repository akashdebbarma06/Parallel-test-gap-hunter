interface CoverageBarProps {
  baseline: number | null;
  final: number | null;
}

export function CoverageBar({ baseline, final }: CoverageBarProps) {
  const baselinePct = baseline ?? 0;
  const finalPct = final ?? baselinePct;
  const delta = finalPct - baselinePct;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Coverage</span>
        <span className="font-semibold text-gray-800">
          {baseline != null ? `${baselinePct.toFixed(1)}%` : '—'}
          {' → '}
          {final != null ? (
            <span className={delta >= 0 ? 'text-green-600' : 'text-red-500'}>
              {finalPct.toFixed(1)}%
              {delta !== 0 && (
                <span className="ml-1 text-xs">
                  ({delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">pending</span>
          )}
        </span>
      </div>

      {/* Before bar */}
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gray-400 rounded-full transition-all"
          style={{ width: `${Math.min(baselinePct, 100)}%` }}
        />
        {final != null && (
          <div
            className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all"
            style={{ width: `${Math.min(finalPct, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
