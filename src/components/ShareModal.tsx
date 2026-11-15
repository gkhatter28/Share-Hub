import React, { useState } from 'react';
import { Check, Copy, Link2, Shield, X } from 'lucide-react';
import { getFileKeyFromKeyring } from '@/src/lib/crypto';
import type { VaultFile } from '@/src/types/vault';

interface ShareModalProps {
  file: VaultFile | null;
  onClose: () => void;
  onGenerateShare: (
    fileId: string,
    opts: { expiresInHours: number; maxDownloads: number; requiresPassphrase: boolean },
  ) => Promise<string>;
}

export const ShareModal: React.FC<ShareModalProps> = ({ file, onClose, onGenerateShare }) => {
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [maxDownloads, setMaxDownloads] = useState(25);
  const [requiresPassphrase, setRequiresPassphrase] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!file) return null;

  const keyEntry = getFileKeyFromKeyring(file.id);
  const effectiveKey = keyEntry?.keyB64 || file.seedKeyB64 || 'LOCAL-KEY-REQUIRED';

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await onGenerateShare(file.id, {
        expiresInHours,
        maxDownloads,
        requiresPassphrase,
      });
      const url = `${window.location.origin}/?share=${encodeURIComponent(token)}#key=${encodeURIComponent(effectiveKey)}`;
      setShareUrl(url);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Zero-Knowledge Encrypted Share
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm">
              {file.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close share modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="p-6 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
            <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              The AES-256 decryption key is placed in the URL <code className="font-mono">#key=</code>{' '}
              fragment, which browsers never send to servers. Recipients decrypt locally.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Link Expiration
              </label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value={24}>24 Hours</option>
                <option value={168}>7 Days</option>
                <option value={720}>30 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Download Limit
              </label>
              <select
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value={1}>1 Download (Burn after read)</option>
                <option value={10}>10 Downloads</option>
                <option value={25}>25 Downloads</option>
                <option value={100}>100 Downloads</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresPassphrase}
              onChange={(e) => setRequiresPassphrase(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600"
            />
            Require team verification badge before decryption
          </label>

          {shareUrl && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Encrypted Share URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-2 font-mono text-[11px] text-slate-800 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5" />
              {loading ? 'Generating...' : shareUrl ? 'Regenerate Link' : 'Generate Encrypted Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
