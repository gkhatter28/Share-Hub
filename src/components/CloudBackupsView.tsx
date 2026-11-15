import React, { useState } from 'react';
import { CheckCircle2, Cloud, Database, RotateCcw, ShieldCheck } from 'lucide-react';
import { formatBytes, formatRelativeTime, formatTimestamp, STORAGE_LABELS } from '@/src/lib/format';
import type { BackupPolicy, BackupSnapshot, CloudConnector, CloudStorageTarget } from '@/src/types/vault';

interface CloudBackupsViewProps {
  connectors: CloudConnector[];
  backups: BackupSnapshot[];
  backupPolicy: BackupPolicy;
  onUpdateConnector: (id: CloudStorageTarget, updates: Partial<CloudConnector>) => Promise<void>;
  onRunBackup: () => Promise<void>;
  onUpdatePolicy: (updates: Partial<BackupPolicy>) => Promise<void>;
  onRestoreSnapshot: (snapshotId: string) => Promise<void>;
}

export const CloudBackupsView: React.FC<CloudBackupsViewProps> = ({
  connectors,
  backups,
  backupPolicy,
  onUpdateConnector,
  onRunBackup,
  onUpdatePolicy,
  onRestoreSnapshot,
}) => {
  const [runningBackup, setRunningBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      await onRunBackup();
      setNotice('Verified encrypted backup snapshot completed');
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setRunningBackup(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await onRestoreSnapshot(id);
      setNotice(`Restored & verified snapshot ${id}`);
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Integrated Cloud Storage Connectors */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Integrated Cloud Storage Providers
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Client-encrypted AES-256-GCM shards replicated across zero-knowledge cloud targets
            </p>
          </div>
          {notice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {notice}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map((c) => {
            const pct = Math.min(100, Math.round((c.usedBytes / c.quotaBytes) * 100));
            return (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-blue-600 dark:text-blue-400">
                      <Cloud className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {c.provider} · {c.region} · {c.latencyMs} ms
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConnector(c.id, {
                        status: c.status === 'connected' ? 'standby' : 'connected',
                      })
                    }
                    className={`text-xs font-medium cursor-pointer ${
                      c.status === 'connected'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {c.status === 'connected' ? 'Connected' : 'Standby'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Encrypted Capacity</span>
                    <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {formatBytes(c.usedBytes)} / {formatBytes(c.quotaBytes)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Mode: Client AES-256-GCM
                  </span>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={c.autoReplicate}
                      onChange={(e) =>
                        onUpdateConnector(c.id, { autoReplicate: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600"
                    />
                    Auto-Replicate
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Automated Backup Policy */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Automated Data Backup Policy
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Last snapshot {formatRelativeTime(backupPolicy.lastRunAt)} · Next scheduled{' '}
              {formatTimestamp(backupPolicy.nextRunAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunBackup}
            disabled={runningBackup}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" />
            {runningBackup ? 'Creating Snapshot...' : 'Run Verified Backup Now'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 text-xs cursor-pointer">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Scheduled Backups
            </span>
            <input
              type="checkbox"
              checked={backupPolicy.enabled}
              onChange={(e) => onUpdatePolicy({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600"
            />
          </label>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2 text-xs flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Cadence</span>
            <select
              value={backupPolicy.frequency}
              onChange={(e) =>
                onUpdatePolicy({ frequency: e.target.value as BackupPolicy['frequency'] })
              }
              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2 text-xs flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Retention</span>
            <select
              value={backupPolicy.retentionDays}
              onChange={(e) => onUpdatePolicy({ retentionDays: Number(e.target.value) })}
              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>365 Days</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2 text-xs flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Target</span>
            <select
              value={backupPolicy.targetCloud}
              onChange={(e) =>
                onUpdatePolicy({ targetCloud: e.target.value as CloudStorageTarget })
              }
              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="s3-archive">AWS S3 Mirror</option>
              <option value="b2-immutable">Backblaze B2 Lock</option>
              <option value="gcs-coldline">GCP Coldline</option>
              <option value="primary-vault">Primary NVMe</option>
            </select>
          </div>
        </div>
      </section>

      {/* Backup Snapshots History */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Immutable Backup Snapshots ({backups.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-5 pr-3">Snapshot ID & Timestamp</th>
                <th className="py-3 px-3">Destination</th>
                <th className="py-3 px-3 text-right">Objects</th>
                <th className="py-3 px-3 text-right">Encrypted Size</th>
                <th className="py-3 px-3">Manifest SHA-256</th>
                <th className="py-3 pl-3 pr-5 text-right">Recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {backups.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="py-3 pl-5 pr-3 whitespace-nowrap">
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {b.id} · {b.type === 'automated' ? 'Automated' : 'Manual'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatTimestamp(b.timestamp)}
                    </p>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {STORAGE_LABELS[b.targetCloud]} · {b.retentionDays}d retention
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    {b.totalFiles}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    {formatBytes(b.totalBytes)}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      {b.manifestSha256.slice(0, 16)}…
                    </span>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={restoringId === b.id}
                      onClick={() => handleRestore(b.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {restoringId === b.id ? 'Verifying...' : 'Verify & Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
