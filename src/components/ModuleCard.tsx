import type { Module } from '../lib/types';

interface ModuleCardProps {
  module: Module;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700 animate-pulse',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function ModuleCard({ module }: ModuleCardProps) {
  const statusStyle = STATUS_STYLES[module.status] ?? STATUS_STYLES.pending;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-gray-800 truncate" title={module.path}>
          {module.path}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyle}`}>
          {module.status}
        </span>
      </div>

      {module.files_scanned != null && (
        <p className="mt-1 text-xs text-gray-500">
          {module.files_scanned} file{module.files_scanned !== 1 ? 's' : ''} scanned
        </p>
      )}

      {module.completed_at && (
        <p className="mt-0.5 text-xs text-gray-400">
          Completed {new Date(module.completed_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
