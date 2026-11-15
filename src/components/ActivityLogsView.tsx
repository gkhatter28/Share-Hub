import React, { useMemo, useState } from 'react';
import { Download, Lock, Search } from 'lucide-react';
import { ACTION_LABELS, formatBytes, formatTimestamp } from '@/src/lib/format';
import type { ActivityAction, ActivityLogEntry } from '@/src/types/vault';

interface ActivityLogsViewProps {
  activity: ActivityLogEntry[];
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ activity }) => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | ActivityAction>('all');

  const filtered = useMemo(() => {
    return activity.filter((item) => {
      if (actionFilter !== 'all' && item.action !== actionFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.targetName.toLowerCase().includes(q) ||
          item.actorName.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q) ||
          item.deviceName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activity, actionFilter, search]);

  const handleExportCsv = () => {
    const header = 'Timestamp,Actor,Device,Action,Target,Details,Bytes';
    const rows = filtered.map((a) =>
      [
        a.timestamp,
        a.actorName,
        a.deviceName,
        ACTION_LABELS[a.action],
        a.targetName,
        a.details.replace(/"/g, '""'),
        a.bytesTransferred ?? 0,
      ]
        .map((v) => `"${v}"`)
        .join(','),
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ciphervault-activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Cryptographic Activity & Audit Logs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {filtered.length} recorded workspace events across connected devices
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter actor, file, device..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | ActivityAction)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="all">All Event Types</option>
            <option value="upload">Encrypted Uploads</option>
            <option value="decrypt">Client Decryptions</option>
            <option value="download">Lossless Downloads</option>
            <option value="permission_updated">Permission Changes</option>
            <option value="backup_completed">Backup Snapshots</option>
            <option value="device_synced">Device Syncs</option>
            <option value="offline_sync">Offline Queue Syncs</option>
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <th className="py-3 pl-5 pr-3">Timestamp</th>
              <th className="py-3 px-3">Actor & Endpoint</th>
              <th className="py-3 px-3">Event & Target</th>
              <th className="py-3 px-3">Verification Detail</th>
              <th className="py-3 pl-3 pr-5 text-right">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                <td className="py-3 pl-5 pr-3 font-mono tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                  {formatTimestamp(entry.timestamp)}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{entry.actorName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{entry.deviceName}</p>
                </td>
                <td className="py-3 px-3">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {ACTION_LABELS[entry.action]}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-xs">
                    {entry.targetName}
                  </p>
                </td>
                <td className="py-3 px-3 max-w-md text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>{entry.details}</span>
                  </span>
                </td>
                <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                  {entry.bytesTransferred ? formatBytes(entry.bytesTransferred) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
