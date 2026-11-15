import React from 'react';
import { Activity, ArrowUpRight, Lock, TrendingUp, Users } from 'lucide-react';
import { MEMBER_AVATARS } from '@/src/lib/avatars';
import { formatBytes } from '@/src/lib/format';
import type { AnalyticsSummary, VaultFile, VaultFolder } from '@/src/types/vault';

interface AnalyticsViewProps {
  analytics: AnalyticsSummary;
  files: VaultFile[];
  folders: VaultFolder[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics, files, folders }) => {
  const maxTransfer = Math.max(...analytics.totalTransferBytes7d, 1);
  const total7dBytes = analytics.totalTransferBytes7d.reduce((acc, b) => acc + b, 0);
  const totalDownloads = files.reduce((acc, f) => acc + f.downloadCount, 0);
  const totalCategoryBytes = Math.max(
    analytics.storageByCategory.reduce((acc, c) => acc + c.bytes, 0),
    1,
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Strip (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>7-Day Encrypted Transfer</span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBytes(total7dBytes)}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
            +{analytics.teamVelocityDeltaPct}% vs prior 7 days
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>E2EE Coverage</span>
            <Lock className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {analytics.encryptionCoveragePct}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {files.length} objects · AES-256-GCM verified
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Avg Lossless Throughput</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {analytics.avgChunkThroughputMbps.toFixed(1)} Mbps
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            1 MiB parallel chunk streaming
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Team Decryptions</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {totalDownloads}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Across {folders.length} encrypted folders
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7-Day Transfer Velocity Bar Chart */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Encrypted Transfer Volume
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lossless chunked bytes transferred across connected team endpoints
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +{analytics.teamVelocityDeltaPct}%
            </span>
          </div>

          <div className="h-56 flex items-end justify-between gap-3 pt-4">
            {analytics.totalTransferBytes7d.map((bytes, idx) => {
              const heightPct = Math.max(10, Math.round((bytes / maxTransfer) * 100));
              return (
                <div key={analytics.transferDates7d[idx]} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {formatBytes(bytes, 1)}
                  </span>
                  <div className="w-full max-w-[44px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-blue-600/85 hover:bg-blue-500 transition-colors"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {analytics.transferDates7d[idx]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Asset Class Distribution */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Vault Asset Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Uncompressed lossless byte allocation by file category
            </p>
          </div>

          <div className="space-y-4 my-6">
            {analytics.storageByCategory.map((cat) => {
              const pct = Math.round((cat.bytes / totalCategoryBytes) * 100);
              return (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {cat.category}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {cat.count} files · {formatBytes(cat.bytes)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            Zero lossy transcoding applied. All checksums verified at ingestion and decryption.
          </p>
        </section>
      </div>

      {/* Team Performance Breakdown Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Team Collaboration & Transfer Velocity
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-5 pr-3">Team Member</th>
                <th className="py-3 px-3 text-right">Encrypted Uploads</th>
                <th className="py-3 px-3 text-right">Verified Decryptions</th>
                <th className="py-3 pl-3 pr-5 text-right">Lossless Volume Shared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {analytics.memberContributions.map((row) => {
                const avatar = MEMBER_AVATARS[row.memberId];
                return (
                  <tr key={row.memberId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={row.name}
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200">
                            {row.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </div>
                        )}
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {row.uploads}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {row.downloads}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                      {formatBytes(row.bytesShared)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
