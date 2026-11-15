import React, { useMemo, useState } from 'react';
import {
  CloudOff,
  Download,
  Eye,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderLock,
  FolderPlus,
  HardDriveDownload,
  Lock,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { formatBytes, formatRelativeTime, STORAGE_LABELS } from '@/src/lib/format';
import type { CloudStorageTarget, VaultFile, VaultFolder } from '@/src/types/vault';

interface VaultExplorerProps {
  folders: VaultFolder[];
  files: VaultFile[];
  selectedFolderId: string | 'all';
  onSelectFolder: (folderId: string | 'all') => void;
  offlineCachedIds: Set<string>;
  queuedFileIds: Set<string>;
  isOfflineMode: boolean;
  onOpenUploadModal: (droppedFiles?: File[]) => void;
  onInspectFile: (file: VaultFile) => void;
  onShareFile: (file: VaultFile) => void;
  onDeleteFile: (file: VaultFile) => void;
  onToggleOfflinePin: (file: VaultFile) => void;
  onCreateFolder: (payload: {
    name: string;
    description: string;
    storageTarget: CloudStorageTarget;
    offlinePinned: boolean;
  }) => Promise<void>;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript')) {
    return FileCode;
  }
  if (mimeType.includes('csv') || mimeType.includes('sheet')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('octet-stream')) {
    return FileArchive;
  }
  return FileText;
}

export const VaultExplorer: React.FC<VaultExplorerProps> = ({
  folders,
  files,
  selectedFolderId,
  onSelectFolder,
  offlineCachedIds,
  queuedFileIds,
  isOfflineMode,
  onOpenUploadModal,
  onInspectFile,
  onShareFile,
  onDeleteFile,
  onToggleOfflinePin,
  onCreateFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'offline' | 'shared'>('all');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [newFolderTarget, setNewFolderTarget] = useState<CloudStorageTarget>('primary-vault');
  const [newFolderPinned, setNewFolderPinned] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [inlineDropActive, setInlineDropActive] = useState(false);

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  );

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (selectedFolderId !== 'all' && file.folderId !== selectedFolderId) return false;
      if (filterMode === 'offline' && !offlineCachedIds.has(file.id)) return false;
      if (filterMode === 'shared' && !file.shareToken) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          file.name.toLowerCase().includes(q) ||
          file.uploadedByName.toLowerCase().includes(q) ||
          file.sha256.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [files, selectedFolderId, filterMode, offlineCachedIds, searchQuery]);

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await onCreateFolder({
        name: newFolderName.trim(),
        description: newFolderDesc.trim(),
        storageTarget: newFolderTarget,
        offlinePinned: newFolderPinned,
      });
      setNewFolderName('');
      setNewFolderDesc('');
      setShowNewFolder(false);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDropZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setInlineDropActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      onOpenUploadModal(dropped);
    }
  };

  const totalVisibleBytes = filteredFiles.reduce((acc, f) => acc + f.originalSize, 0);

  return (
    <div className="space-y-6">
      {/* Folders Row */}
      <section aria-label="Encrypted team folders">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Encrypted Team Folders
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Zero-knowledge client encryption with granular role access and cloud routing
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewFolder((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </button>
        </div>

        {showNewFolder && (
          <form
            onSubmit={handleCreateFolderSubmit}
            className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Board Audit 2026"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cloud Storage Route
                </label>
                <select
                  value={newFolderTarget}
                  onChange={(e) => setNewFolderTarget(e.target.value as CloudStorageTarget)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="primary-vault">CipherVault NVMe (Primary)</option>
                  <option value="s3-archive">AWS S3 Enterprise Mirror</option>
                  <option value="b2-immutable">Backblaze B2 Object Lock</option>
                  <option value="gcs-coldline">Google Cloud Coldline</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  placeholder="Purpose and retention scope"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFolderPinned}
                  onChange={(e) => setNewFolderPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                Pin folder for automatic offline travel caching
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolder(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {creatingFolder ? 'Creating...' : 'Create Encrypted Folder'}
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => onSelectFolder('all')}
            className={`text-left rounded-xl border p-4 transition-colors cursor-pointer ${
              selectedFolderId === 'all'
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/25'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <FolderLock className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {files.length} files
              </span>
            </div>
            <p className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              All Vault Files
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              Unified encrypted directory
            </p>
          </button>

          {folders.map((folder) => {
            const count = files.filter((f) => f.folderId === folder.id).length;
            const isSelected = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className={`text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/25'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Lock className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {count} files
                  </span>
                </div>
                <p className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {folder.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                  {STORAGE_LABELS[folder.storageTarget]}
                  {folder.offlinePinned ? ' · Offline Ready' : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Drag & Drop Upload Interface */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setInlineDropActive(true);
        }}
        onDragLeave={() => setInlineDropActive(false)}
        onDrop={handleDropZone}
        className={`rounded-xl border border-dashed p-5 transition-colors ${
          inlineDropActive
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Drag and drop files here for lossless AES-256-GCM encryption
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Large files stream in 1 MiB verified chunks with zero compression loss
                {isOfflineMode ? ' · Offline mode active: files queue automatically in IndexedDB' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenUploadModal()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UploadCloud className="h-4 w-4" />
            Select Files to Encrypt
          </button>
        </div>
      </div>

      {/* File Table Toolbar + Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeFolder ? activeFolder.name : 'All Encrypted Objects'}
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredFiles.length} items · {formatBytes(totalVisibleBytes)} lossless
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, owners, SHA-256..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#0B0F17] p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('offline')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterMode === 'offline'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Offline Cached
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('shared')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterMode === 'shared'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Shared Links
              </button>
            </div>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              No matching encrypted files
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Drop files above or upload a document to encrypt it with AES-256-GCM before transfer.
            </p>
            <button
              type="button"
              onClick={() => onOpenUploadModal()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              Upload First Encrypted File
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3">File & Integrity</th>
                  <th className="py-3 px-3">Owner & Updated</th>
                  <th className="py-3 px-3 text-right">Lossless Size</th>
                  <th className="py-3 px-3">Protection & Sync</th>
                  <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredFiles.map((file) => {
                  const Icon = getFileIcon(file.mimeType);
                  const isCached = offlineCachedIds.has(file.id);
                  const isQueued = queuedFileIds.has(file.id);
                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3 max-w-xs">
                        <button
                          type="button"
                          onClick={() => onInspectFile(file)}
                          className="flex items-center gap-3 text-left group cursor-pointer w-full"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-300">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                              {file.name}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                              SHA-256 {file.sha256.slice(0, 14)}… · {file.chunkCount}{' '}
                              {file.chunkCount === 1 ? 'chunk' : 'chunks'}
                            </p>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="text-slate-800 dark:text-slate-200">{file.uploadedByName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatRelativeTime(file.updatedAt)} · {STORAGE_LABELS[file.storageTarget]}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {formatBytes(file.originalSize)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Lock className="h-3 w-3" />
                            AES-256-GCM
                          </span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          {isQueued ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                              <CloudOff className="h-3 w-3" />
                              Queued Offline
                            </span>
                          ) : isCached ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                              <HardDriveDownload className="h-3 w-3" />
                              Offline Ready
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">Cloud Synced</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onInspectFile(file)}
                            title="Decrypt & Preview"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">Decrypt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleOfflinePin(file)}
                            title={isCached ? 'Remove from offline cache' : 'Cache locally for offline travel'}
                            className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                              isCached
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <HardDriveDownload className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onShareFile(file)}
                            title="Create Zero-Knowledge Share Link"
                            className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteFile(file)}
                            title="Delete encrypted object"
                            className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
