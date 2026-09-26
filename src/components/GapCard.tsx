import type { Gap } from '../lib/types';

interface GapCardProps {
  gap: Gap;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const RISK_COLOURS: Record<string, string> = {
  high: 'border-red-400 bg-red-50',
  medium: 'border-amber-400 bg-amber-50',
  low: 'border-green-400 bg-green-50',
};

const BADGE_COLOURS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

function riskLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: '✓ Approved',
  edited: '✎ Edited',
  rejected: '✗ Rejected',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  approved: 'bg-green-100 text-green-700',
  edited: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-600',
};

export function GapCard({ gap, onApprove, onReject }: GapCardProps) {
  const level = riskLevel(gap.risk_score);
  const isPending = gap.approval_status === 'pending';

  return (
    <div className={`border-l-4 rounded-lg p-4 ${RISK_COLOURS[level]} space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono font-semibold text-gray-900">{gap.target}</span>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{gap.file}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_COLOURS[level]}`}>
            {level.toUpperCase()} · {gap.risk_score}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[gap.approval_status]}`}>
            {STATUS_LABELS[gap.approval_status] ?? gap.approval_status}
          </span>
        </div>
      </div>

      {/* Risk reasons */}
      {gap.risk_reasons?.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {gap.risk_reasons.map((r, i) => (
            <li
              key={i}
              className="text-xs bg-white/60 border border-gray-200 rounded px-2 py-0.5 text-gray-600"
            >
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* Draft test */}
      {gap.draft_test && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-gray-700 hover:text-gray-900 select-none">
            Draft test
          </summary>
          <pre className="mt-2 text-xs bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
            <code>{gap.draft_test}</code>
          </pre>
        </details>
      )}

      {/* Rationale */}
      {gap.draft_rationale && (
        <p className="text-xs text-gray-600 italic">{gap.draft_rationale}</p>
      )}

      {/* Actions */}
      {isPending && (onApprove || onReject) && (
        <div className="flex gap-2 pt-1">
          {onApprove && (
            <button
              onClick={() => onApprove(gap.id)}
              className="px-3 py-1 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Approve
            </button>
          )}
          {onReject && (
            <button
              onClick={() => onReject(gap.id)}
              className="px-3 py-1 text-sm font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
}
