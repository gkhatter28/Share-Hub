import React, { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Lock, Shield, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '@/src/lib/format';
import type { VaultFolder } from '@/src/types/vault';

export interface UploadJobProgress {
  fileName: string;
  size: number;
  stage: 'hashing' | 'encrypting' | 'uploading' | 'queued-offline' | 'completed' | 'error';
  progressPct: number;
  detail: string;
}

interface UploadModalProps {
  isOpen: boolean;
  initialFiles: File[];
  folders: VaultFolder[];
  defaultFolderId: string;
  isOfflineMode: boolean;
  onClose: () => void;
  onStartUpload: (params: {
    files: File[];
    folderId: string;
    passphrase: string;
    pinOffline: boolean;
    onProgress: (jobs: UploadJobProgress[]) => void;
  }) => Promise<void>;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  initialFiles,
  folders,
  defaultFolderId,
  isOfflineMode,
  onClose,
  onStartUpload,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [passphrase, setPassphrase] = useState('');
  const [pinOffline, setPinOffline] = useState(true);
  const [jobs, setJobs] = useState<UploadJobProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedFiles(initialFiles);
      setFolderId(
        defaultFolderId !== 'all'
          ? defaultFolderId
          : folders[0]?.id || '',
      );
      setJobs([]);
      setIsRunning(false);
    }
  }, [isOpen, initialFiles, defaultFolderId, folders]);

  if (!isOpen) return null;

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      setSelectedFiles((prev) => [...prev, ...dropped]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !folderId) return;
    setIsRunning(true);
    try {
      await onStartUpload({
        files: selectedFiles,
        folderId,
        passphrase,
        pinOffline,
        onProgress: setJobs,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const allDone = jobs.length > 0 && jobs.every((j) => j.stage === 'completed' || j.stage === 'queued-offline');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Client-Side Encrypted Upload
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Files are hashed (SHA-256) and encrypted (AES-256-GCM) locally before leaving your device
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            aria-label="Close upload modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {!isRunning && !allDone && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] p-6 text-center"
            >
              <UploadCloud className="mx-auto h-7 w-7 text-blue-500" />
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                Drop large or lossless files here
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Zero transcoding or lossy compression · Streamed in 1 MiB encrypted chunks
              </p>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                Browse Device Files
                <input type="file" multiple className="hidden" onChange={handleFileInput} />
              </label>
            </div>
          )}

          {selectedFiles.length > 0 && jobs.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ready to Encrypt ({selectedFiles.length}{' '}
                {selectedFiles.length === 1 ? 'file' : 'files'})
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto">
                {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200 pr-3">
                      {file.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.fileName}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {job.fileName}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums shrink-0 text-slate-600 dark:text-slate-300">
                      {job.stage === 'completed' && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      {job.stage === 'queued-offline' && (
                        <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      {job.progressPct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        job.stage === 'error'
                          ? 'bg-rose-500'
                          : job.stage === 'queued-offline'
                            ? 'bg-amber-500'
                            : job.stage === 'completed'
                              ? 'bg-emerald-500'
                              : 'bg-blue-600'
                      }`}
                      style={{ width: `${job.progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {job.detail}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!allDone && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Destination Folder
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  disabled={isRunning}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Optional Passphrase Lock (PBKDF2)
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  disabled={isRunning}
                  placeholder="Leave blank for random 256-bit key"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {!allDone && (
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pinOffline}
                onChange={(e) => setPinOffline(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              Cache encrypted copy in IndexedDB for offline travel access
            </label>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              {isOfflineMode
                ? 'Offline Mode: Queuing locally for auto-sync'
                : 'Zero-Knowledge AES-256-GCM Enclave'}
            </span>
            <div className="flex items-center gap-2">
              {allDone ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isRunning}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRunning || selectedFiles.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {isRunning
                      ? 'Encrypting & Transferring...'
                      : isOfflineMode
                        ? 'Encrypt & Queue Offline'
                        : 'Encrypt & Upload Losslessly'}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
