import React from 'react';
import {
  CloudOff,
  HardDriveDownload,
  Laptop,
  Plane,
  RefreshCw,
  Smartphone,
  Tablet,
  Wifi,
} from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/src/lib/format';
import type { OfflineQueuedAction } from '@/src/lib/offlineDb';
import type { ConnectedDevice, VaultFile } from '@/src/types/vault';

interface DevicesOfflineViewProps {
  devices: ConnectedDevice[];
  files: VaultFile[];
  offlineCachedIds: Set<string>;
  offlineQueue: OfflineQueuedAction[];
  isTravelMode: boolean;
  isBrowserOnline: boolean;
  isSyncing: boolean;
  onToggleTravelMode: () => void;
  onSyncNow: () => Promise<void>;
  onSyncDevice: (deviceId: string) => Promise<void>;
  onToggleFileOfflinePin: (file: VaultFile) => Promise<void>;
  onInspectFile: (file: VaultFile) => void;
}

function getPlatformIcon(platform: ConnectedDevice['platform']) {
  if (platform === 'iOS' || platform === 'Android') return Smartphone;
  if (platform === 'macOS' || platform === 'Windows') return Laptop;
  return Tablet;
}

export const DevicesOfflineView: React.FC<DevicesOfflineViewProps> = ({
  devices,
  files,
  offlineCachedIds,
  offlineQueue,
  isTravelMode,
  isBrowserOnline,
  isSyncing,
  onToggleTravelMode,
  onSyncNow,
  onSyncDevice,
  onToggleFileOfflinePin,
  onInspectFile,
}) => {
  const cachedFiles = files.filter((f) => offlineCachedIds.has(f.id));
  const totalCachedBytes = cachedFiles.reduce((acc, f) => acc + f.originalSize, 0);

  return (
    <div className="space-y-6">
      {/* Travel / Offline Mode & Sync Banner */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                isTravelMode || !isBrowserOnline
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isTravelMode || !isBrowserOnline ? (
                <Plane className="h-5 w-5" />
              ) : (
                <Wifi className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {isTravelMode
                  ? 'Travel Offline Mode Active'
                  : !isBrowserOnline
                    ? 'Network Disconnected — Offline Vault Active'
                    : 'Cross-Platform Automatic Sync Active'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {cachedFiles.length} encrypted files ({formatBytes(totalCachedBytes)}) stored in local
                IndexedDB for zero-network access · {offlineQueue.length} pending queued sync{' '}
                {offlineQueue.length === 1 ? 'operation' : 'operations'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleTravelMode}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isTravelMode
                  ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Plane className="h-3.5 w-3.5" />
              {isTravelMode ? 'Exit Travel Mode & Auto-Sync' : 'Simulate Travel Offline Mode'}
            </button>

            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing || isTravelMode || !isBrowserOnline}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing Devices...' : 'Sync All Devices Now'}
            </button>
          </div>
        </div>
      </section>

      {/* Pending Offline Sync Queue */}
      {offlineQueue.length > 0 && (
        <section className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pending Offline Sync Queue ({offlineQueue.length})
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Automatically flushes when connectivity resumes
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {offlineQueue.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {item.type === 'upload'
                      ? `Encrypted Upload: ${item.name}`
                      : item.type === 'createFolder'
                        ? `New Folder: ${item.name}`
                        : item.type === 'deleteFile'
                          ? `Delete File: ${item.fileId}`
                          : 'Permission Update'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Queued {formatRelativeTime(item.createdAt)}
                    {item.type === 'upload' ? ` · ${formatBytes(item.originalSize)} encrypted` : ''}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                  Awaiting Connection
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Connected Devices Grid */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Connected Cross-Platform Devices ({devices.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time WebSocket delta sync across desktop workstations, tablets, and mobile PWA clients
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => {
            const Icon = getPlatformIcon(device.platform);
            return (
              <div
                key={device.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {device.name}
                        {device.isCurrent ? ' (This Device)' : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {device.platform} · {device.browserOrClient}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      device.syncState === 'synced'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : device.syncState === 'syncing'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {device.syncState === 'synced'
                      ? 'Synced'
                      : device.syncState === 'syncing'
                        ? 'Syncing'
                        : 'Offline'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
                  <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                    Last sync {formatRelativeTime(device.lastSyncAt)} · Offline cache{' '}
                    {formatBytes(device.offlineStorageBytes)} · {device.region}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSyncDevice(device.id)}
                    disabled={isTravelMode || !isBrowserOnline}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Sync
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Offline Travel Cache Manager */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Offline Travel Cache (IndexedDB)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Files pinned below remain encrypted and accessible even without internet access
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {cachedFiles.length} cached · {formatBytes(totalCachedBytes)}
          </span>
        </div>

        {cachedFiles.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No files pinned for offline travel yet. Click the download-pin icon on any file in Vault &
            Files to cache it locally.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {cachedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between px-5 py-3">
                <button
                  type="button"
                  onClick={() => onInspectFile(file)}
                  className="text-left hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer min-w-0 pr-4"
                >
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {file.name}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatBytes(file.originalSize)} · Verified SHA-256 {file.sha256.slice(0, 12)}…
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectFile(file)}
                    className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Open Offline
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFileOfflinePin(file)}
                    title="Unpin from offline storage"
                    className="rounded-md p-1.5 text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <HardDriveDownload className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
