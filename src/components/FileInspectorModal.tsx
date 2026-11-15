import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDriveDownload,
  KeyRound,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  decryptFileLossless,
  derivePassphraseKey,
  exportKeyB64Url,
  getFileKeyFromKeyring,
} from '@/src/lib/crypto';
import { apiUrl, formatBytes, formatTimestamp, STORAGE_LABELS } from '@/src/lib/format';
import { getOfflineCachedBlob } from '@/src/lib/offlineDb';
import type { VaultFile } from '@/src/types/vault';

interface FileInspectorModalProps {
  file: VaultFile | null;
  initialKeyOverride?: string;
  isOfflineMode: boolean;
  onClose: () => void;
  onLogDecryption: (fileId: string, mode: 'preview' | 'download') => Promise<void>;
  onToggleOfflinePin: (file: VaultFile) => Promise<void>;
  isOfflineCached: boolean;
}

export const FileInspectorModal: React.FC<FileInspectorModalProps> = ({
  file,
  initialKeyOverride,
  isOfflineMode,
  onClose,
  onLogDecryption,
  onToggleOfflinePin,
  isOfflineCached,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decryptedBuffer, setDecryptedBuffer] = useState<ArrayBuffer | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [sourceUsed, setSourceUsed] = useState<'offline-cache' | 'cloud-vault' | null>(null);

  useEffect(() => {
    setPassphrase('');
    setManualKey(initialKeyOverride || '');
    setErrorMsg(null);
    setDecryptedBuffer(null);
    setVerifiedHash(null);
    setIntegrityOk(null);
    setPreviewText(null);
    setSourceUsed(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file?.id, initialKeyOverride]);

  if (!file) return null;

  const keyringEntry = getFileKeyFromKeyring(file.id);
  const hasAutoKey = Boolean(initialKeyOverride || keyringEntry?.keyB64 || file.seedKeyB64);

  const handleDecrypt = async (triggerDownload = false) => {
    setDecrypting(true);
    setErrorMsg(null);
    try {
      let ciphertext: ArrayBuffer;
      const cached = await getOfflineCachedBlob(file.id);
      if (cached && (isOfflineMode || !navigator.onLine)) {
        ciphertext = cached.ciphertext;
        setSourceUsed('offline-cache');
      } else if (cached && isOfflineMode) {
        ciphertext = cached.ciphertext;
        setSourceUsed('offline-cache');
      } else {
        try {
          if (isOfflineMode) {
            throw new Error('Travel offline mode enabled');
          }
          const res = await fetch(apiUrl(`/api/files/${file.id}/blob`));
          if (!res.ok) throw new Error('Unable to download encrypted payload from vault');
          ciphertext = await res.arrayBuffer();
          setSourceUsed('cloud-vault');
        } catch (netErr) {
          if (cached) {
            ciphertext = cached.ciphertext;
            setSourceUsed('offline-cache');
          } else {
            throw netErr;
          }
        }
      }

      let keyToUse =
        manualKey.trim() ||
        initialKeyOverride ||
        keyringEntry?.keyB64 ||
        file.seedKeyB64 ||
        cached?.keyB64;

      if (!keyToUse && passphrase.trim() && file.keySalt) {
        const derived = await derivePassphraseKey(passphrase.trim(), file.keySalt);
        keyToUse = await exportKeyB64Url(derived.key);
      }

      if (!keyToUse) {
        throw new Error(
          'Decryption key not found in local keyring. Enter the file passphrase or paste the #key secret.',
        );
      }

      const result = await decryptFileLossless(ciphertext, file.ivHex, keyToUse, file.sha256);
      setDecryptedBuffer(result.plaintext);
      setVerifiedHash(result.verifiedSha256);
      setIntegrityOk(result.integrityMatch);

      // Prepare preview
      if (
        file.mimeType.startsWith('text/') ||
        file.mimeType.includes('json') ||
        file.mimeType.includes('xml') ||
        file.mimeType.includes('svg')
      ) {
        const text = new TextDecoder().decode(result.plaintext);
        setPreviewText(text);
      }
      if (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf') {
        const blob = new Blob([result.plaintext], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }

      if (triggerDownload) {
        savePlaintextFile(result.plaintext, file.name, file.mimeType);
      }
      await onLogDecryption(file.id, triggerDownload ? 'download' : 'preview');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Decryption failed: invalid key, passphrase, or corrupted ciphertext.',
      );
    } finally {
      setDecrypting(false);
    }
  };

  const savePlaintextFile = (buf: ArrayBuffer, name: string, mimeType: string) => {
    const blob = new Blob([buf], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {file.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {formatBytes(file.originalSize)} lossless · {STORAGE_LABELS[file.storageTarget]} ·
              Uploaded {formatTimestamp(file.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Cryptographic Verification Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
              <p className="text-slate-500 dark:text-slate-400">Cipher Suite</p>
              <p className="mt-1 font-mono font-medium text-slate-900 dark:text-slate-100">
                AES-256-GCM
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
              <p className="text-slate-500 dark:text-slate-400">96-bit IV (Hex)</p>
              <p className="mt-1 font-mono text-slate-900 dark:text-slate-100 truncate">
                {file.ivHex}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
              <p className="text-slate-500 dark:text-slate-400">Expected SHA-256</p>
              <p className="mt-1 font-mono text-slate-900 dark:text-slate-100 truncate">
                {file.sha256}
              </p>
            </div>
          </div>

          {/* Key / Passphrase Controls if not yet decrypted */}
          {!decryptedBuffer && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {hasAutoKey
                      ? 'Decryption key ready in local WebCrypto keyring'
                      : 'Passphrase or Zero-Knowledge Key Required'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    The server stores only AES-256-GCM ciphertext. Decryption and SHA-256 lossless
                    verification occur entirely inside your browser.
                  </p>
                </div>
              </div>

              {(!hasAutoKey || file.keySalt) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {file.keySalt && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Passphrase (PBKDF2)
                      </label>
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter passphrase"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Or Paste #key Secret
                    </label>
                    <input
                      type="text"
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                      placeholder="Base64URL 256-bit key"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDecrypt(false)}
                  disabled={decrypting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {decrypting ? 'Decrypting...' : 'Decrypt & Verify Lossless'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecrypt(true)}
                  disabled={decrypting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Decrypt & Download
                </button>
              </div>
            </div>
          )}

          {/* Decrypted Result & Preview */}
          {decryptedBuffer && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 px-4 py-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    {integrityOk
                      ? 'Lossless Bit-for-Bit Verification Passed'
                      : 'Decrypted (Hash Mismatch)'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {sourceUsed === 'offline-cache' ? 'Source: IndexedDB Offline Vault' : 'Source: Encrypted Cloud Vault'} · Verified {verifiedHash?.slice(0, 12)}…
                </div>
              </div>

              {previewUrl && file.mimeType.startsWith('image/') && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-4 flex justify-center">
                  <img
                    src={previewUrl}
                    alt={file.name}
                    referrerPolicy="no-referrer"
                    className="max-h-72 rounded-lg object-contain"
                  />
                </div>
              )}

              {previewText !== null && !file.mimeType.startsWith('image/') && (
                <pre className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 text-xs font-mono overflow-x-auto max-h-72 leading-relaxed">
                  {previewText}
                </pre>
              )}

              {!previewUrl && previewText === null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-6 text-center text-xs text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="mx-auto h-7 w-7 text-emerald-500 mb-2" />
                  Binary payload decrypted ({formatBytes(decryptedBuffer.byteLength)} lossless). Click
                  below to save the verified original file.
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    savePlaintextFile(decryptedBuffer, file.name, file.mimeType)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save Lossless Original ({formatBytes(decryptedBuffer.byteLength)})
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 bg-slate-50/60 dark:bg-[#0B0F17]/60">
          <button
            type="button"
            onClick={() => onToggleOfflinePin(file)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            {isOfflineCached ? 'Pinned in Offline Travel Cache' : 'Pin for Offline Travel Access'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
