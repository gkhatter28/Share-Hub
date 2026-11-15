import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Cloud,
  FolderLock,
  HardDrive,
  Laptop,
  Lock,
  Menu,
  Moon,
  Plane,
  Shield,
  Sun,
  UploadCloud,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { ActivityLogsView } from '@/src/components/ActivityLogsView';
import { AnalyticsView } from '@/src/components/AnalyticsView';
import { CloudBackupsView } from '@/src/components/CloudBackupsView';
import { DevicesOfflineView } from '@/src/components/DevicesOfflineView';
import { FileInspectorModal } from '@/src/components/FileInspectorModal';
import { PermissionsView } from '@/src/components/PermissionsView';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';
import { ShareModal } from '@/src/components/ShareModal';
import { UploadModal, type UploadJobProgress } from '@/src/components/UploadModal';
import { VaultExplorer } from '@/src/components/VaultExplorer';
import { MEMBER_AVATARS } from '@/src/lib/avatars';
import { encryptFileLossless, saveKeyToKeyring } from '@/src/lib/crypto';
import { apiUrl, detectCurrentDevice, formatBytes, formatRelativeTime, wsUrl } from '@/src/lib/format';
import {
  cacheEncryptedBlobOffline,
  enqueueOfflineAction,
  listAllOfflineCachedBlobs,
  listOfflineQueue,
  loadOfflineWorkspaceSnapshot,
  type OfflineQueuedAction,
  removeOfflineCachedBlob,
  removeOfflineQueueItem,
  saveOfflineWorkspaceSnapshot,
} from '@/src/lib/offlineDb';
import { createStandaloneOfflineSeed } from '@/src/lib/offlineVaultSeed';
import type {
  BackupPolicy,
  CloudConnector,
  CloudStorageTarget,
  FolderPermission,
  PushEvent,
  VaultFile,
  VaultFolder,
  VaultStatePayload,
} from '@/src/types/vault';

type WorkspaceTab =
  | 'vault'
  | 'analytics'
  | 'permissions'
  | 'devices'
  | 'backups'
  | 'activity';

const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MiB lossless chunks

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('vault');
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all'>('all');
  const [vaultState, setVaultState] = useState<VaultStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Theme (default dark mode for improved visibility & reduced eye strain)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('ciphervault_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Connectivity & Travel Mode
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isTravelMode, setIsTravelMode] = useState(false);
  const isOfflineMode = isTravelMode || !isBrowserOnline;
  const [isSyncing, setIsSyncing] = useState(false);

  // Offline caches
  const [offlineCachedIds, setOfflineCachedIds] = useState<Set<string>>(new Set());
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedAction[]>([]);

  // Modals & Drawers
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [windowDragActive, setWindowDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  const [inspectedFile, setInspectedFile] = useState<VaultFile | null>(null);
  const [inspectedKeyOverride, setInspectedKeyOverride] = useState<string | undefined>(undefined);
  const [shareTargetFile, setShareTargetFile] = useState<VaultFile | null>(null);

  // Real-time Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<PushEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [toastEvent, setToastEvent] = useState<PushEvent | null>(null);

  const currentDevice = useMemo(() => detectCurrentDevice(), []);

  // Sync HTML dark class & theme-color
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('ciphervault_theme', theme);
    } catch {
      // ignore
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0B0F17' : '#F8FAFC');
    }
  }, [theme]);

  const refreshOfflineStores = useCallback(async () => {
    try {
      const [blobs, queue] = await Promise.all([
        listAllOfflineCachedBlobs(),
        listOfflineQueue(),
      ]);
      setOfflineCachedIds(new Set(blobs.map((b) => b.fileId)));
      setOfflineQueue(queue);
    } catch {
      // IndexedDB unavailable fallback
    }
  }, []);

  const cachePinnedFoldersOffline = useCallback(
    async (state: VaultStatePayload) => {
      if (isOfflineMode) return;
      try {
        const existing = await listAllOfflineCachedBlobs();
        const existingSet = new Set(existing.map((b) => b.fileId));
        const pinnedFolderIds = new Set(
          state.folders.filter((f) => f.offlinePinned).map((f) => f.id),
        );
        const toCache = state.files.filter(
          (f) => pinnedFolderIds.has(f.folderId) && !existingSet.has(f.id),
        );
        for (const file of toCache.slice(0, 6)) {
          const res = await fetch(apiUrl(`/api/files/${file.id}/blob`));
          if (res.ok) {
            const ciphertext = await res.arrayBuffer();
            await cacheEncryptedBlobOffline({
              fileId: file.id,
              name: file.name,
              mimeType: file.mimeType,
              ivHex: file.ivHex,
              sha256: file.sha256,
              ciphertext,
              cachedAt: new Date().toISOString(),
              keyB64: file.seedKeyB64,
            });
          }
        }
        await refreshOfflineStores();
      } catch {
        // non-blocking background cache
      }
    },
    [isOfflineMode, refreshOfflineStores],
  );

  const fetchVaultState = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/vault/state'));
      if (!res.ok) throw new Error('Failed to fetch vault state');
      const data = (await res.json()) as VaultStatePayload;
      setVaultState(data);
      setLoadError(null);
      await saveOfflineWorkspaceSnapshot(data);
      void cachePinnedFoldersOffline(data);
    } catch {
      const cached = await loadOfflineWorkspaceSnapshot();
      if (cached) {
        setVaultState(cached);
        setLoadError(null);
      } else {
        const standalone = await createStandaloneOfflineSeed();
        setVaultState(standalone);
        setIsTravelMode(true);
        setLoadError(null);
        await refreshOfflineStores();
      }
    } finally {
      setLoading(false);
    }
  }, [cachePinnedFoldersOffline, refreshOfflineStores]);

  // Initial load + device registration + share link check
  useEffect(() => {
    void fetchVaultState();
    void refreshOfflineStores();

    // Register current browser endpoint
    if (navigator.onLine) {
      void fetch(apiUrl('/api/devices/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentDevice),
      }).catch(() => {});
    }

    // Handle zero-knowledge shared link (?share=...#key=...)
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');
    const hashMatch = window.location.hash.match(/key=([^&]+)/);
    const keyFragment = hashMatch ? decodeURIComponent(hashMatch[1]) : undefined;
    if (shareToken) {
      fetch(apiUrl(`/api/share/${encodeURIComponent(shareToken)}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { file?: VaultFile } | null) => {
          if (data?.file) {
            setInspectedKeyOverride(keyFragment);
            setInspectedFile(data.file);
          }
        })
        .catch(() => {});
    }
  }, [currentDevice, fetchVaultState, refreshOfflineStores]);

  // Helper to upload encrypted payload in 1 MiB chunks
  const streamEncryptedChunksToServer = useCallback(
    async (params: {
      folderId: string;
      name: string;
      mimeType: string;
      originalSize: number;
      ciphertext: ArrayBuffer;
      sha256: string;
      ivHex: string;
      keySalt?: string;
      storageTarget: CloudStorageTarget;
      isOfflineSync?: boolean;
      onChunkProgress?: (pct: number, chunkIdx: number, totalChunks: number) => void;
    }): Promise<VaultFile> => {
      const totalChunks = Math.max(1, Math.ceil(params.ciphertext.byteLength / CHUNK_SIZE_BYTES));
      const initRes = await fetch(apiUrl('/api/upload/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: params.folderId,
          name: params.name,
          mimeType: params.mimeType,
          originalSize: params.originalSize,
          encryptedSize: params.ciphertext.byteLength,
          totalChunks,
          sha256: params.sha256,
          ivHex: params.ivHex,
          keySalt: params.keySalt,
          actorId: 'usr-elena',
          actorName: 'Elena Vance',
          deviceName: currentDevice.name,
          storageTarget: params.storageTarget,
        }),
      });
      if (!initRes.ok) throw new Error('Failed to initialize chunked upload');
      const { uploadId } = (await initRes.json()) as { uploadId: string };

      for (let idx = 0; idx < totalChunks; idx++) {
        const start = idx * CHUNK_SIZE_BYTES;
        const end = Math.min(params.ciphertext.byteLength, start + CHUNK_SIZE_BYTES);
        const slice = params.ciphertext.slice(start, end);
        const chunkRes = await fetch(apiUrl(`/api/upload/chunk/${uploadId}/${idx}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: slice,
        });
        if (!chunkRes.ok) throw new Error(`Failed uploading encrypted chunk ${idx + 1}`);
        const pct = Math.round(((idx + 1) / totalChunks) * 100);
        params.onChunkProgress?.(pct, idx + 1, totalChunks);
      }

      const compRes = await fetch(apiUrl('/api/upload/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, isOfflineSync: params.isOfflineSync }),
      });
      if (!compRes.ok) throw new Error('Failed to assemble lossless encrypted file');
      const data = (await compRes.json()) as { file: VaultFile };
      return data.file;
    },
    [currentDevice.name],
  );

  // Flush pending offline actions when online
  const flushOfflineQueue = useCallback(async () => {
    if (isTravelMode || !navigator.onLine) return;
    const queue = await listOfflineQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    try {
      for (const item of queue) {
        if (item.type === 'upload') {
          const uploaded = await streamEncryptedChunksToServer({
            folderId: item.folderId,
            name: item.name,
            mimeType: item.mimeType,
            originalSize: item.originalSize,
            ciphertext: item.ciphertext,
            sha256: item.sha256,
            ivHex: item.ivHex,
            keySalt: item.keySalt,
            storageTarget: item.storageTarget,
            isOfflineSync: true,
          });
          saveKeyToKeyring(uploaded.id, {
            keyB64: item.keyB64,
            passphraseProtected: Boolean(item.keySalt),
            saltHex: item.keySalt,
          });
          // Re-index offline blob under server fileId
          await cacheEncryptedBlobOffline({
            fileId: uploaded.id,
            name: uploaded.name,
            mimeType: uploaded.mimeType,
            ivHex: uploaded.ivHex,
            sha256: uploaded.sha256,
            ciphertext: item.ciphertext,
            cachedAt: new Date().toISOString(),
            keyB64: item.keyB64,
          });
          await removeOfflineCachedBlob(item.tempFile.id);
        } else if (item.type === 'createFolder') {
          await fetch(apiUrl('/api/folders'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name,
              description: item.description,
              storageTarget: item.storageTarget,
              encryptedZeroKnowledge: item.encryptedZeroKnowledge,
              offlinePinned: item.offlinePinned,
            }),
          });
        } else if (item.type === 'updatePermissions') {
          await fetch(apiUrl(`/api/folders/${item.folderId}/permissions`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              permissions: item.permissions,
              summary: item.summary,
            }),
          });
        } else if (item.type === 'deleteFile') {
          await fetch(apiUrl(`/api/files/${item.fileId}`), { method: 'DELETE' });
        }
        await removeOfflineQueueItem(item.id);
      }
      await refreshOfflineStores();
      await fetchVaultState();
    } finally {
      setIsSyncing(false);
    }
  }, [fetchVaultState, isTravelMode, refreshOfflineStores, streamEncryptedChunksToServer]);

  // Browser online/offline listeners
  useEffect(() => {
    const onOnline = () => {
      setIsBrowserOnline(true);
      void flushOfflineQueue();
    };
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushOfflineQueue]);

  // Real-time WebSocket connection for cross-device sync & push notifications
  useEffect(() => {
    if (isOfflineMode) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByCleanup = false;

    const connect = () => {
      ws = new WebSocket(wsUrl('/ws'));
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as PushEvent;
          setNotifications((prev) => [event, ...prev].slice(0, 40));
          setUnreadCount((c) => c + 1);
          setToastEvent(event);
          setTimeout(() => {
            setToastEvent((curr) => (curr?.id === event.id ? null : curr));
          }, 4200);

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`CipherVault · ${event.title}`, {
                body: event.message,
                icon: '/pwa-192x192.png',
              });
            } catch {
              // ignore notification restriction in iframe
            }
          }
          void fetchVaultState();
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (!closedByCleanup && !isOfflineMode) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [fetchVaultState, isOfflineMode]);

  // Global window drag & drop overlay
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        dragCounterRef.current += 1;
        setWindowDragActive(true);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };
    const handleDragLeave = () => {
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setWindowDragActive(false);
      }
    };
    const handleDrop = (e: DragEvent) => {
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        dragCounterRef.current = 0;
        setWindowDragActive(false);
        setDroppedFiles(Array.from(e.dataTransfer.files));
        setUploadModalOpen(true);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleRequestPushPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
  };

  // Upload workflow (supports online chunked streaming AND offline travel queuing)
  const handleStartUpload = async ({
    files,
    folderId,
    passphrase,
    pinOffline,
    onProgress,
  }: {
    files: File[];
    folderId: string;
    passphrase: string;
    pinOffline: boolean;
    onProgress: (jobs: UploadJobProgress[]) => void;
  }) => {
    const folder = vaultState?.folders.find((f) => f.id === folderId);
    const storageTarget: CloudStorageTarget = folder?.storageTarget || 'primary-vault';
    const progressState: UploadJobProgress[] = files.map((f) => ({
      fileName: f.name,
      size: f.size,
      stage: 'hashing',
      progressPct: 10,
      detail: 'Computing SHA-256 lossless fingerprint...',
    }));
    onProgress([...progressState]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const plainBuffer = await file.arrayBuffer();
        progressState[i] = {
          ...progressState[i],
          stage: 'encrypting',
          progressPct: 35,
          detail: 'Encrypting locally with AES-256-GCM...',
        };
        onProgress([...progressState]);

        const encrypted = await encryptFileLossless(plainBuffer, passphrase);

        if (isOfflineMode) {
          const tempId = `offline-${crypto.randomUUID().slice(0, 8)}`;
          const now = new Date().toISOString();
          const tempFile: VaultFile = {
            id: tempId,
            folderId,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            originalSize: file.size,
            encryptedSize: encrypted.ciphertext.byteLength,
            chunkCount: Math.max(1, Math.ceil(encrypted.ciphertext.byteLength / CHUNK_SIZE_BYTES)),
            sha256: encrypted.sha256,
            ivHex: encrypted.ivHex,
            keySalt: encrypted.keySalt,
            uploadedBy: 'usr-elena',
            uploadedByName: 'Elena Vance',
            createdAt: now,
            updatedAt: now,
            downloadCount: 0,
            losslessVerified: true,
            isEncrypted: true,
            storageTarget,
          };

          saveKeyToKeyring(tempId, {
            keyB64: encrypted.keyB64,
            passphraseProtected: Boolean(encrypted.keySalt),
            saltHex: encrypted.keySalt,
          });
          await cacheEncryptedBlobOffline({
            fileId: tempId,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            ivHex: encrypted.ivHex,
            sha256: encrypted.sha256,
            ciphertext: encrypted.ciphertext,
            cachedAt: now,
            keyB64: encrypted.keyB64,
          });
          await enqueueOfflineAction({
            id: `q-${crypto.randomUUID()}`,
            type: 'upload',
            createdAt: now,
            folderId,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            originalSize: file.size,
            encryptedSize: encrypted.ciphertext.byteLength,
            sha256: encrypted.sha256,
            ivHex: encrypted.ivHex,
            keyB64: encrypted.keyB64,
            keySalt: encrypted.keySalt,
            storageTarget,
            ciphertext: encrypted.ciphertext,
            tempFile,
          });

          setVaultState((prev) =>
            prev ? { ...prev, files: [tempFile, ...prev.files] } : prev,
          );
          await refreshOfflineStores();

          progressState[i] = {
            ...progressState[i],
            stage: 'queued-offline',
            progressPct: 100,
            detail: 'Encrypted & queued in IndexedDB for automatic sync',
          };
          onProgress([...progressState]);
        } else {
          progressState[i] = {
            ...progressState[i],
            stage: 'uploading',
            progressPct: 45,
            detail: 'Streaming encrypted chunks losslessly...',
          };
          onProgress([...progressState]);

          const uploaded = await streamEncryptedChunksToServer({
            folderId,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            originalSize: file.size,
            ciphertext: encrypted.ciphertext,
            sha256: encrypted.sha256,
            ivHex: encrypted.ivHex,
            keySalt: encrypted.keySalt,
            storageTarget,
            onChunkProgress: (pct, chunkIdx, total) => {
              progressState[i] = {
                ...progressState[i],
                stage: 'uploading',
                progressPct: Math.max(45, Math.round(45 + pct * 0.55)),
                detail: `Uploaded encrypted chunk ${chunkIdx}/${total}`,
              };
              onProgress([...progressState]);
            },
          });

          saveKeyToKeyring(uploaded.id, {
            keyB64: encrypted.keyB64,
            passphraseProtected: Boolean(encrypted.keySalt),
            saltHex: encrypted.keySalt,
          });

          if (pinOffline) {
            await cacheEncryptedBlobOffline({
              fileId: uploaded.id,
              name: uploaded.name,
              mimeType: uploaded.mimeType,
              ivHex: uploaded.ivHex,
              sha256: uploaded.sha256,
              ciphertext: encrypted.ciphertext,
              cachedAt: new Date().toISOString(),
              keyB64: encrypted.keyB64,
            });
          }

          progressState[i] = {
            ...progressState[i],
            stage: 'completed',
            progressPct: 100,
            detail: `Verified lossless (${uploaded.chunkCount} encrypted chunks)`,
          };
          onProgress([...progressState]);
        }
      } catch (err) {
        progressState[i] = {
          ...progressState[i],
          stage: 'error',
          progressPct: 100,
          detail: err instanceof Error ? err.message : 'Encryption or transfer error',
        };
        onProgress([...progressState]);
      }
    }

    await refreshOfflineStores();
    if (!isOfflineMode) {
      await fetchVaultState();
    }
  };

  const handleToggleOfflinePin = async (file: VaultFile) => {
    if (offlineCachedIds.has(file.id)) {
      await removeOfflineCachedBlob(file.id);
    } else if (!isOfflineMode) {
      const res = await fetch(apiUrl(`/api/files/${file.id}/blob`));
      if (res.ok) {
        const ciphertext = await res.arrayBuffer();
        await cacheEncryptedBlobOffline({
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          ivHex: file.ivHex,
          sha256: file.sha256,
          ciphertext,
          cachedAt: new Date().toISOString(),
          keyB64: file.seedKeyB64,
        });
      }
    }
    await refreshOfflineStores();
  };

  const handleDeleteFile = async (file: VaultFile) => {
    if (isOfflineMode) {
      await enqueueOfflineAction({
        id: `q-${crypto.randomUUID()}`,
        type: 'deleteFile',
        createdAt: new Date().toISOString(),
        fileId: file.id,
      });
      setVaultState((prev) =>
        prev ? { ...prev, files: prev.files.filter((f) => f.id !== file.id) } : prev,
      );
      await removeOfflineCachedBlob(file.id);
      await refreshOfflineStores();
      return;
    }
    await fetch(apiUrl(`/api/files/${file.id}`), { method: 'DELETE' });
    await removeOfflineCachedBlob(file.id);
    await refreshOfflineStores();
    await fetchVaultState();
  };

  const handleCreateFolder = async (payload: {
    name: string;
    description: string;
    storageTarget: CloudStorageTarget;
    offlinePinned: boolean;
  }) => {
    if (isOfflineMode) {
      const tempId = `fld-off-${crypto.randomUUID().slice(0, 6)}`;
      const now = new Date().toISOString();
      const folder: VaultFolder = {
        id: tempId,
        name: payload.name,
        description: payload.description || 'Encrypted team workspace folder.',
        parentId: null,
        encryptedZeroKnowledge: true,
        storageTarget: payload.storageTarget,
        createdAt: now,
        updatedAt: now,
        offlinePinned: payload.offlinePinned,
        permissions: (vaultState?.members || []).map((m, idx) => ({
          memberId: m.id,
          role: idx === 0 ? 'owner' : 'editor',
          canShareExternal: idx === 0,
        })),
      };
      await enqueueOfflineAction({
        id: `q-${crypto.randomUUID()}`,
        type: 'createFolder',
        createdAt: now,
        tempFolderId: tempId,
        name: payload.name,
        description: payload.description,
        storageTarget: payload.storageTarget,
        encryptedZeroKnowledge: true,
        offlinePinned: payload.offlinePinned,
      });
      setVaultState((prev) => (prev ? { ...prev, folders: [...prev.folders, folder] } : prev));
      await refreshOfflineStores();
      return;
    }
    await fetch(apiUrl('/api/folders'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await fetchVaultState();
  };

  const handleUpdatePermissions = async (
    folderId: string,
    permissions: FolderPermission[],
    summary: string,
  ) => {
    if (isOfflineMode) {
      await enqueueOfflineAction({
        id: `q-${crypto.randomUUID()}`,
        type: 'updatePermissions',
        createdAt: new Date().toISOString(),
        folderId,
        permissions,
        summary,
      });
      setVaultState((prev) =>
        prev
          ? {
              ...prev,
              folders: prev.folders.map((f) =>
                f.id === folderId ? { ...f, permissions } : f,
              ),
            }
          : prev,
      );
      await refreshOfflineStores();
      return;
    }
    await fetch(apiUrl(`/api/folders/${folderId}/permissions`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions, summary }),
    });
    await fetchVaultState();
  };

  const handleUpdateFolderConfig = async (
    folderId: string,
    updates: Partial<VaultFolder>,
  ) => {
    await fetch(apiUrl(`/api/folders/${folderId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchVaultState();
  };

  const handleLogDecryption = async (fileId: string, mode: 'preview' | 'download') => {
    if (isOfflineMode) return;
    await fetch(apiUrl(`/api/files/${fileId}/decrypted-event`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorName: 'Elena Vance',
        deviceName: currentDevice.name,
        mode,
      }),
    }).catch(() => {});
    void fetchVaultState();
  };

  const handleGenerateShare = async (
    fileId: string,
    opts: { expiresInHours: number; maxDownloads: number; requiresPassphrase: boolean },
  ): Promise<string> => {
    const res = await fetch(apiUrl(`/api/files/${fileId}/share`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = (await res.json()) as { shareToken: string };
    await fetchVaultState();
    return data.shareToken;
  };

  const handleToggleTravelMode = async () => {
    const next = !isTravelMode;
    setIsTravelMode(next);
    if (!next && navigator.onLine) {
      setTimeout(() => {
        void flushOfflineQueue();
      }, 150);
    }
  };

  const handleSyncAllDevices = async () => {
    setIsSyncing(true);
    try {
      await flushOfflineQueue();
      await fetch(apiUrl(`/api/devices/${currentDevice.id}/sync`), { method: 'POST' }).catch(() => {});
      await fetchVaultState();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncSingleDevice = async (deviceId: string) => {
    await fetch(apiUrl(`/api/devices/${deviceId}/sync`), { method: 'POST' });
    await fetchVaultState();
  };

  const handleUpdateConnector = async (
    id: CloudStorageTarget,
    updates: Partial<CloudConnector>,
  ) => {
    await fetch(apiUrl(`/api/storage/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchVaultState();
  };

  const handleRunBackup = async () => {
    await fetch(apiUrl('/api/backups/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'manual' }),
    });
    await fetchVaultState();
  };

  const handleUpdatePolicy = async (updates: Partial<BackupPolicy>) => {
    await fetch(apiUrl('/api/backups/policy'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchVaultState();
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    await fetch(apiUrl(`/api/backups/${snapshotId}/restore`), { method: 'POST' });
    await fetchVaultState();
  };

  const queuedFileIds = useMemo(
    () =>
      new Set(
        offlineQueue
          .filter((q): q is Extract<OfflineQueuedAction, { type: 'upload' }> => q.type === 'upload')
          .map((q) => q.tempFile.id),
      ),
    [offlineQueue],
  );

  const totalVaultUsedBytes = useMemo(
    () => (vaultState?.files || []).reduce((acc, f) => acc + f.originalSize, 0),
    [vaultState?.files],
  );

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'vault', label: 'Vault & Files', icon: FolderLock },
    { id: 'analytics', label: 'Team Analytics', icon: BarChart3 },
    { id: 'permissions', label: 'Folder Permissions', icon: Users },
    { id: 'devices', label: 'Devices & Offline', icon: Laptop },
    { id: 'backups', label: 'Cloud & Backups', icon: Cloud },
    { id: 'activity', label: 'Activity Logs', icon: Activity },
  ];

  const activeNavMeta = navItems.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Workspace Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Shield className="h-4 w-4" />
              </div>
              <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                CipherVault
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="p-3 space-y-1" aria-label="Primary workspace navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'devices' && offlineQueue.length > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                      {offlineQueue.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Storage & Active User Summary */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <HardDrive className="h-3.5 w-3.5 text-blue-500" />
                Encrypted Vault
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {formatBytes(totalVaultUsedBytes)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Lock className="h-3 w-3" />
                AES-256-GCM
              </span>
              <span className="tabular-nums">{offlineCachedIds.size} offline cached</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <img
              src={MEMBER_AVATARS['usr-elena']}
              alt="Elena Vance"
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                Elena Vance
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Security Architect
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-xs px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
                Workspace
              </span>
              <span className="text-slate-400 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Offline / Travel Mode Switch */}
            <button
              type="button"
              onClick={handleToggleTravelMode}
              title={
                isOfflineMode
                  ? 'Offline travel vault active — click to reconnect & auto-sync'
                  : 'Switch to Travel Offline Mode'
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOfflineMode
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {isOfflineMode ? (
                <>
                  <Plane className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Offline Mode</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">Synced</span>
                </>
              )}
            </button>

            <PWAInstallButton />

            {/* Real-time Push Notifications Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setUnreadCount(0);
                }}
                aria-label="Project notifications"
                className="relative inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="ml-1 font-mono text-[10px] font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Real-Time Project Updates
                    </span>
                    {pushPermission !== 'granted' ? (
                      <button
                        type="button"
                        onClick={handleRequestPushPermission}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Enable Push Alerts
                      </button>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Browser Push Enabled
                      </span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        Listening for live WebSocket events across connected devices.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {formatRelativeTime(n.timestamp)}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dark / Light Theme Switch */}
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Primary CTA */}
            <button
              type="button"
              onClick={() => {
                setDroppedFiles([]);
                setUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Encrypt & Upload</span>
              <span className="sm:hidden">Upload</span>
            </button>
          </div>
        </header>

        {/* Non-Intrusive Offline Status Strip when disconnected or in Travel Mode */}
        {isOfflineMode && (
          <div className="border-b border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-6 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              {isTravelMode
                ? 'Travel Offline Mode enabled — accessing locally cached IndexedDB vault. New uploads queue automatically.'
                : 'No network connection detected — operating seamlessly from offline IndexedDB cache.'}
            </span>
            {isTravelMode && (
              <button
                type="button"
                onClick={handleToggleTravelMode}
                className="text-xs font-semibold text-amber-900 dark:text-amber-200 underline cursor-pointer"
              >
                Reconnect & Auto-Sync
              </button>
            )}
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] animate-pulse" />
              <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] animate-pulse" />
            </div>
          ) : loadError || !vaultState ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-[#111827] p-8 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Unable to load encrypted workspace
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{loadError}</p>
              <button
                type="button"
                onClick={fetchVaultState}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'vault' && (
                <VaultExplorer
                  folders={vaultState.folders}
                  files={vaultState.files}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                  offlineCachedIds={offlineCachedIds}
                  queuedFileIds={queuedFileIds}
                  isOfflineMode={isOfflineMode}
                  onOpenUploadModal={(files) => {
                    setDroppedFiles(files || []);
                    setUploadModalOpen(true);
                  }}
                  onInspectFile={(file) => {
                    setInspectedKeyOverride(undefined);
                    setInspectedFile(file);
                  }}
                  onShareFile={setShareTargetFile}
                  onDeleteFile={handleDeleteFile}
                  onToggleOfflinePin={handleToggleOfflinePin}
                  onCreateFolder={handleCreateFolder}
                />
              )}

              {activeTab === 'analytics' && (
                <AnalyticsView
                  analytics={vaultState.analytics}
                  files={vaultState.files}
                  folders={vaultState.folders}
                />
              )}

              {activeTab === 'permissions' && (
                <PermissionsView
                  folders={vaultState.folders}
                  members={vaultState.members}
                  onUpdatePermissions={handleUpdatePermissions}
                  onUpdateFolderConfig={handleUpdateFolderConfig}
                />
              )}

              {activeTab === 'devices' && (
                <DevicesOfflineView
                  devices={vaultState.devices}
                  files={vaultState.files}
                  offlineCachedIds={offlineCachedIds}
                  offlineQueue={offlineQueue}
                  isTravelMode={isTravelMode}
                  isBrowserOnline={isBrowserOnline}
                  isSyncing={isSyncing}
                  onToggleTravelMode={handleToggleTravelMode}
                  onSyncNow={handleSyncAllDevices}
                  onSyncDevice={handleSyncSingleDevice}
                  onToggleFileOfflinePin={handleToggleOfflinePin}
                  onInspectFile={(file) => {
                    setInspectedKeyOverride(undefined);
                    setInspectedFile(file);
                  }}
                />
              )}

              {activeTab === 'backups' && (
                <CloudBackupsView
                  connectors={vaultState.connectors}
                  backups={vaultState.backups}
                  backupPolicy={vaultState.backupPolicy}
                  onUpdateConnector={handleUpdateConnector}
                  onRunBackup={handleRunBackup}
                  onUpdatePolicy={handleUpdatePolicy}
                  onRestoreSnapshot={handleRestoreSnapshot}
                />
              )}

              {activeTab === 'activity' && (
                <ActivityLogsView activity={vaultState.activity} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Full-Viewport Drag & Drop Overlay */}
      {windowDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-6 pointer-events-none">
          <div className="max-w-md w-full rounded-2xl border-2 border-dashed border-blue-500 bg-[#111827] p-10 text-center shadow-2xl">
            <UploadCloud className="mx-auto h-10 w-10 text-blue-400" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Drop files to encrypt with AES-256-GCM
            </h2>
            <p className="mt-1.5 text-xs text-slate-300">
              Lossless chunked upload with client-side SHA-256 verification
            </p>
          </div>
        </div>
      )}

      {/* Real-time Push Toast */}
      {toastEvent && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {toastEvent.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                {toastEvent.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToastEvent(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <UploadModal
        isOpen={uploadModalOpen}
        initialFiles={droppedFiles}
        folders={vaultState?.folders || []}
        defaultFolderId={selectedFolderId}
        isOfflineMode={isOfflineMode}
        onClose={() => {
          setUploadModalOpen(false);
          setDroppedFiles([]);
        }}
        onStartUpload={handleStartUpload}
      />

      <FileInspectorModal
        file={inspectedFile}
        initialKeyOverride={inspectedKeyOverride}
        isOfflineMode={isOfflineMode}
        onClose={() => {
          setInspectedFile(null);
          setInspectedKeyOverride(undefined);
        }}
        onLogDecryption={handleLogDecryption}
        onToggleOfflinePin={handleToggleOfflinePin}
        isOfflineCached={inspectedFile ? offlineCachedIds.has(inspectedFile.id) : false}
      />

      <ShareModal
        file={shareTargetFile}
        onClose={() => setShareTargetFile(null)}
        onGenerateShare={handleGenerateShare}
      />
    </div>
  );
}
