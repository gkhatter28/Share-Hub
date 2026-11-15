import type {
  CloudStorageTarget,
  FolderPermission,
  VaultFile,
  VaultStatePayload,
} from '@/src/types/vault';

const DB_NAME = 'ciphervault-offline-v1';
const DB_VERSION = 1;

export interface CachedBlobRecord {
  fileId: string;
  name: string;
  mimeType: string;
  ivHex: string;
  sha256: string;
  ciphertext: ArrayBuffer;
  cachedAt: string;
  keyB64?: string;
}

export type OfflineQueuedAction =
  | {
      id: string;
      type: 'upload';
      createdAt: string;
      folderId: string;
      name: string;
      mimeType: string;
      originalSize: number;
      encryptedSize: number;
      sha256: string;
      ivHex: string;
      keyB64: string;
      keySalt?: string;
      storageTarget: CloudStorageTarget;
      ciphertext: ArrayBuffer;
      tempFile: VaultFile;
    }
  | {
      id: string;
      type: 'createFolder';
      createdAt: string;
      tempFolderId: string;
      name: string;
      description: string;
      storageTarget: CloudStorageTarget;
      encryptedZeroKnowledge: boolean;
      offlinePinned: boolean;
    }
  | {
      id: string;
      type: 'updatePermissions';
      createdAt: string;
      folderId: string;
      permissions: FolderPermission[];
      summary: string;
    }
  | {
      id: string;
      type: 'deleteFile';
      createdAt: string;
      fileId: string;
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state');
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'fileId' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineWorkspaceSnapshot(state: VaultStatePayload): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(state, 'snapshot');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadOfflineWorkspaceSnapshot(): Promise<VaultStatePayload | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const req = tx.objectStore('state').get('snapshot');
    req.onsuccess = () => resolve((req.result as VaultStatePayload) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheEncryptedBlobOffline(record: CachedBlobRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineCachedBlob(fileId: string): Promise<CachedBlobRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(fileId);
    req.onsuccess = () => resolve((req.result as CachedBlobRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineCachedBlob(fileId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').delete(fileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listAllOfflineCachedBlobs(): Promise<CachedBlobRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').getAll();
    req.onsuccess = () => resolve((req.result as CachedBlobRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineAction(action: OfflineQueuedAction): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOfflineQueue(): Promise<OfflineQueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () => {
      const items = (req.result as OfflineQueuedAction[]) || [];
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineQueueItem(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
