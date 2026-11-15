import { encryptFileLossless, saveKeyToKeyring } from '@/src/lib/crypto';
import { cacheEncryptedBlobOffline, saveOfflineWorkspaceSnapshot } from '@/src/lib/offlineDb';
import type { VaultFile, VaultStatePayload } from '@/src/types/vault';

export async function createStandaloneOfflineSeed(): Promise<VaultStatePayload> {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const sampleDocs = [
    {
      id: 'file-zk-mobile-spec',
      folderId: 'fld-exec',
      name: 'CipherVault_Mobile_E2EE_Guide.md',
      mimeType: 'text/markdown',
      uploadedBy: 'usr-elena',
      uploadedByName: 'Elena Vance',
      content: `# CipherVault Mobile Offline Vault\n\nThis Android build runs Web Crypto AES-256-GCM encryption and IndexedDB offline caching directly on your device.\n\n- Drag or select any file to encrypt locally before sync\n- Connect a backend via VITE_API_BASE_URL for multi-device WebSocket sync\n`,
    },
    {
      id: 'file-offline-policy',
      folderId: 'fld-arch',
      name: 'Offline_Sync_Configuration.json',
      mimeType: 'application/json',
      uploadedBy: 'usr-marcus',
      uploadedByName: 'Marcus Chen',
      content: JSON.stringify(
        {
          cipher: 'AES-256-GCM',
          integrity: 'SHA-256',
          chunkSizeBytes: 1048576,
          offlineStorage: 'IndexedDB',
        },
        null,
        2,
      ),
    },
  ];

  const files: VaultFile[] = [];
  for (const doc of sampleDocs) {
    const plain = new TextEncoder().encode(doc.content);
    const enc = await encryptFileLossless(plain.buffer);
    const fileRecord: VaultFile = {
      id: doc.id,
      folderId: doc.folderId,
      name: doc.name,
      mimeType: doc.mimeType,
      originalSize: plain.byteLength,
      encryptedSize: enc.ciphertext.byteLength,
      chunkCount: 1,
      sha256: enc.sha256,
      ivHex: enc.ivHex,
      uploadedBy: doc.uploadedBy,
      uploadedByName: doc.uploadedByName,
      createdAt: iso(-3600000),
      updatedAt: iso(-3600000),
      downloadCount: 1,
      losslessVerified: true,
      isEncrypted: true,
      storageTarget: 'primary-vault',
      seedKeyB64: enc.keyB64,
    };
    files.push(fileRecord);
    saveKeyToKeyring(doc.id, { keyB64: enc.keyB64 });
    await cacheEncryptedBlobOffline({
      fileId: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      ivHex: enc.ivHex,
      sha256: enc.sha256,
      ciphertext: enc.ciphertext,
      cachedAt: new Date().toISOString(),
      keyB64: enc.keyB64,
    });
  }

  const state: VaultStatePayload = {
    members: [
      {
        id: 'usr-elena',
        name: 'Elena Vance',
        email: 'elena.vance@ciphervault.io',
        roleTitle: 'Principal Security Architect',
        department: 'Security & Cryptography',
        publicKeyFingerprint: 'ED25519:8F4A-C912-0E7B-41D3',
      },
      {
        id: 'usr-marcus',
        name: 'Marcus Chen',
        email: 'marcus.chen@ciphervault.io',
        roleTitle: 'Staff Systems Engineer',
        department: 'Distributed Storage',
        publicKeyFingerprint: 'ED25519:3D19-7B82-A540-92E1',
      },
      {
        id: 'usr-amara',
        name: 'Amara Okafor',
        email: 'amara.okafor@ciphervault.io',
        roleTitle: 'Director of Product Design',
        department: 'Design Systems',
        publicKeyFingerprint: 'ED25519:6C21-F048-19D4-B8A7',
      },
    ],
    folders: [
      {
        id: 'fld-exec',
        name: 'Executive Briefings',
        description: 'Board decks, memos, and encrypted financial models.',
        parentId: null,
        encryptedZeroKnowledge: true,
        storageTarget: 'primary-vault',
        createdAt: iso(-86400000 * 7),
        updatedAt: iso(-3600000),
        offlinePinned: true,
        permissions: [
          { memberId: 'usr-elena', role: 'owner', canShareExternal: true },
          { memberId: 'usr-marcus', role: 'editor', canShareExternal: true },
          { memberId: 'usr-amara', role: 'downloader', canShareExternal: false },
        ],
      },
      {
        id: 'fld-arch',
        name: 'Architecture & Specs',
        description: 'Zero-knowledge protocol blueprints and schemas.',
        parentId: null,
        encryptedZeroKnowledge: true,
        storageTarget: 's3-archive',
        createdAt: iso(-86400000 * 5),
        updatedAt: iso(-3600000),
        offlinePinned: true,
        permissions: [
          { memberId: 'usr-elena', role: 'owner', canShareExternal: true },
          { memberId: 'usr-marcus', role: 'owner', canShareExternal: true },
          { memberId: 'usr-amara', role: 'editor', canShareExternal: false },
        ],
      },
    ],
    files,
    devices: [
      {
        id: 'dev-android-local',
        name: 'Android Mobile Client',
        platform: 'Android',
        browserOrClient: 'Capacitor Android WebCrypto',
        syncState: 'offline',
        lastSyncAt: iso(-60000),
        offlineStorageBytes: files.reduce((a, f) => a + f.originalSize, 0),
        region: 'On-Device Enclave',
        isCurrent: true,
      },
    ],
    activity: [
      {
        id: 'act-local-1',
        timestamp: iso(-60000),
        actorId: 'usr-elena',
        actorName: 'Elena Vance',
        deviceName: 'Android Mobile Client',
        action: 'offline_sync',
        targetName: 'Local Offline Vault',
        details: 'Initialized local AES-256-GCM IndexedDB vault for offline access.',
        encrypted: true,
      },
    ],
    backups: [
      {
        id: 'bkp-local-1',
        timestamp: iso(-3600000),
        type: 'automated',
        status: 'completed',
        totalFiles: files.length,
        totalBytes: files.reduce((a, f) => a + f.originalSize, 0),
        manifestSha256: files[0].sha256,
        targetCloud: 'primary-vault',
        retentionDays: 90,
      },
    ],
    backupPolicy: {
      enabled: true,
      frequency: 'hourly',
      retentionDays: 90,
      targetCloud: 'primary-vault',
      verifyChecksums: true,
      lastRunAt: iso(-3600000),
      nextRunAt: iso(3600000),
    },
    connectors: [
      {
        id: 'primary-vault',
        name: 'CipherVault Primary NVMe',
        provider: 'CipherVault Edge',
        region: 'us-west-2',
        usedBytes: 42_949_672_960,
        quotaBytes: 268_435_456_000,
        encryptionMode: 'client-aes-256-gcm',
        status: 'connected',
        latencyMs: 14,
        autoReplicate: true,
      },
    ],
    analytics: {
      totalTransferBytes7d: [120_000_000, 190_000_000, 150_000_000, 260_000_000, 210_000_000, 310_000_000, 340_000_000],
      transferDates7d: ['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'Yesterday', 'Today'],
      encryptionCoveragePct: 100,
      avgChunkThroughputMbps: 245.0,
      teamVelocityDeltaPct: 18.4,
      memberContributions: [
        { memberId: 'usr-elena', name: 'Elena Vance', uploads: 1, downloads: 1, bytesShared: files[0].originalSize },
        { memberId: 'usr-marcus', name: 'Marcus Chen', uploads: 1, downloads: 1, bytesShared: files[1].originalSize },
      ],
      storageByCategory: [
        { category: 'Documents & Specs', bytes: files[0].originalSize, count: 1 },
        { category: 'Structured Data', bytes: files[1].originalSize, count: 1 },
      ],
    },
  };

  await saveOfflineWorkspaceSnapshot(state);
  return state;
}
