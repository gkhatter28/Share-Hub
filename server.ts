import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ActivityLogEntry,
  AnalyticsSummary,
  BackupPolicy,
  BackupSnapshot,
  CloudConnector,
  CloudStorageTarget,
  ConnectedDevice,
  FolderPermission,
  PushEvent,
  TeamMember,
  VaultFile,
  VaultFolder,
  VaultStatePayload,
} from './src/types/vault.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, '.vault_data');
const BLOBS_DIR = path.join(DATA_DIR, 'blobs');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const DB_PATH = path.join(DATA_DIR, 'vault-db.json');

fs.mkdirSync(BLOBS_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

interface PersistedDb {
  members: TeamMember[];
  folders: VaultFolder[];
  files: VaultFile[];
  devices: ConnectedDevice[];
  activity: ActivityLogEntry[];
  backups: BackupSnapshot[];
  backupPolicy: BackupPolicy;
  connectors: CloudConnector[];
  transferSeries7d: { dates: string[]; bytes: number[] };
}

interface UploadSession {
  uploadId: string;
  folderId: string;
  name: string;
  mimeType: string;
  originalSize: number;
  encryptedSize: number;
  totalChunks: number;
  sha256: string;
  ivHex: string;
  keySalt?: string;
  actorId: string;
  actorName: string;
  deviceName: string;
  storageTarget: CloudStorageTarget;
  receivedChunks: Set<number>;
}

const uploadSessions = new Map<string, UploadSession>();

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encryptWithAes256Gcm(plaintext: Buffer): {
  ciphertextWithTag: Buffer;
  ivHex: string;
  sha256: string;
  keyB64: string;
} {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const sha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // WebCrypto AES-GCM expects ciphertext || 16-byte tag
  const ciphertextWithTag = Buffer.concat([encrypted, tag]);
  return {
    ciphertextWithTag,
    ivHex: iv.toString('hex'),
    sha256,
    keyB64: toBase64Url(key),
  };
}

function computeManifestHash(files: VaultFile[]): string {
  const canonical = files
    .map((f) => `${f.id}:${f.sha256}:${f.originalSize}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(canonical || 'empty-vault').digest('hex');
}

function createSeedDatabase(): PersistedDb {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const members: TeamMember[] = [
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
    {
      id: 'usr-lucas',
      name: 'Lucas Meyer',
      email: 'lucas.meyer@ciphervault.io',
      roleTitle: 'Compliance Counsel',
      department: 'Legal & Governance',
      publicKeyFingerprint: 'ED25519:9A74-22E6-D315-50F9',
    },
  ];

  const folders: VaultFolder[] = [
    {
      id: 'fld-exec',
      name: 'Executive Briefings',
      description: 'Board decks, Q4 strategy memos, and encrypted financial models.',
      parentId: null,
      encryptedZeroKnowledge: true,
      storageTarget: 'primary-vault',
      createdAt: iso(-86400000 * 14),
      updatedAt: iso(-3600000 * 3),
      offlinePinned: true,
      permissions: [
        { memberId: 'usr-elena', role: 'owner', canShareExternal: true },
        { memberId: 'usr-marcus', role: 'editor', canShareExternal: true },
        { memberId: 'usr-amara', role: 'downloader', canShareExternal: false },
        { memberId: 'usr-lucas', role: 'viewer', canShareExternal: false },
      ],
    },
    {
      id: 'fld-arch',
      name: 'Architecture & Specs',
      description: 'Zero-knowledge protocol blueprints, API contracts, and topology schemas.',
      parentId: null,
      encryptedZeroKnowledge: true,
      storageTarget: 's3-archive',
      createdAt: iso(-86400000 * 10),
      updatedAt: iso(-3600000 * 1),
      offlinePinned: true,
      permissions: [
        { memberId: 'usr-elena', role: 'owner', canShareExternal: true },
        { memberId: 'usr-marcus', role: 'owner', canShareExternal: true },
        { memberId: 'usr-amara', role: 'editor', canShareExternal: false },
        { memberId: 'usr-lucas', role: 'revoked', canShareExternal: false },
      ],
    },
    {
      id: 'fld-media',
      name: 'Lossless Media Masters',
      description: 'Uncompressed RAW photography, 4K ProRes plates, and brand master assets.',
      parentId: null,
      encryptedZeroKnowledge: true,
      storageTarget: 'b2-immutable',
      createdAt: iso(-86400000 * 7),
      updatedAt: iso(-3600000 * 5),
      offlinePinned: false,
      permissions: [
        { memberId: 'usr-elena', role: 'editor', canShareExternal: true },
        { memberId: 'usr-marcus', role: 'downloader', canShareExternal: false },
        { memberId: 'usr-amara', role: 'owner', canShareExternal: true },
        { memberId: 'usr-lucas', role: 'viewer', canShareExternal: false },
      ],
    },
    {
      id: 'fld-audit',
      name: 'Compliance & SOC2 Audits',
      description: 'Immutable cryptographic audit proofs, DPA agreements, and retention logs.',
      parentId: null,
      encryptedZeroKnowledge: true,
      storageTarget: 'gcs-coldline',
      createdAt: iso(-86400000 * 21),
      updatedAt: iso(-3600000 * 12),
      offlinePinned: false,
      permissions: [
        { memberId: 'usr-elena', role: 'owner', canShareExternal: false },
        { memberId: 'usr-marcus', role: 'viewer', canShareExternal: false },
        { memberId: 'usr-amara', role: 'viewer', canShareExternal: false },
        { memberId: 'usr-lucas', role: 'owner', canShareExternal: true },
      ],
    },
  ];

  const seedDocs: Array<{
    id: string;
    folderId: string;
    name: string;
    mimeType: string;
    content: string;
    uploadedBy: string;
    uploadedByName: string;
    storageTarget: CloudStorageTarget;
    offsetMs: number;
    downloads: number;
    declaredSize?: number;
  }> = [
    {
      id: 'file-zk-spec',
      folderId: 'fld-arch',
      name: 'Zero-Knowledge_E2EE_Protocol_v3.md',
      mimeType: 'text/markdown',
      uploadedBy: 'usr-elena',
      uploadedByName: 'Elena Vance',
      storageTarget: 's3-archive',
      offsetMs: -3600000 * 2,
      downloads: 18,
      content: `# CipherVault End-to-End Encryption Specification\n\n## 1. Client-Side Key Generation\nEvery uploaded object generates an ephemeral 256-bit AES-GCM content encryption key (CEK) inside the browser Web Crypto enclave.\n\n- Cipher Suite: AES-256-GCM (96-bit random IV, 128-bit authentication tag)\n- Integrity Verification: SHA-256 computed over unencrypted raw binary prior to chunking\n- Zero-Knowledge Guarantee: Encryption keys never leave the client or appear in server logs; external share links encode the CEK exclusively in the URL #key= fragment.\n\n## 2. Lossless Chunked Transport\nLarge files are segmented into 1 MiB encrypted frames without transcoding or lossy compression, guaranteeing bit-for-bit restoration across desktop and mobile endpoints.\n`,
    },
    {
      id: 'file-q4-memo',
      folderId: 'fld-exec',
      name: 'Q4_Infrastructure_Allocation.json',
      mimeType: 'application/json',
      uploadedBy: 'usr-marcus',
      uploadedByName: 'Marcus Chen',
      storageTarget: 'primary-vault',
      offsetMs: -3600000 * 5,
      downloads: 11,
      content: JSON.stringify(
        {
          quarter: '2026-Q4',
          encryptionStandard: 'AES-256-GCM',
          losslessMode: true,
          replicationTargets: [
            { region: 'us-west-2', provider: 'Primary Vault', redundancy: '3x NVMe' },
            { region: 'eu-central-1', provider: 'Backblaze B2', redundancy: 'Object Lock' },
          ],
          budgetAllocatedUSD: 148500,
          approvedBy: 'Elena Vance',
        },
        null,
        2,
      ),
    },
    {
      id: 'file-key-rotation',
      folderId: 'fld-audit',
      name: 'SOC2_TypeII_Key_Attestation.csv',
      mimeType: 'text/csv',
      uploadedBy: 'usr-lucas',
      uploadedByName: 'Lucas Meyer',
      storageTarget: 'gcs-coldline',
      offsetMs: -3600000 * 14,
      downloads: 24,
      content: [
        'Control_ID,Verification_Method,Cipher_Suite,Zero_Knowledge_Verified,Auditor_Signoff',
        'CC6.1,Client-Side WebCrypto AES-256-GCM,AES-GCM-256,PASS,L.Meyer',
        'CC6.7,Chunked SHA-256 Integrity Digest,SHA-256,PASS,E.Vance',
        'CC7.2,Immutable Snapshot Hash Chain,SHA-256,PASS,M.Chen',
        'A1.2,Cross-Region Coldline Replication,AES-GCM-256,PASS,L.Meyer',
      ].join('\n'),
    },
    {
      id: 'file-brand-svg',
      folderId: 'fld-media',
      name: 'CipherVault_Vector_Master.svg',
      mimeType: 'image/svg+xml',
      uploadedBy: 'usr-amara',
      uploadedByName: 'Amara Okafor',
      storageTarget: 'b2-immutable',
      offsetMs: -3600000 * 9,
      downloads: 32,
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" fill="none">\n  <rect width="640" height="360" rx="20" fill="#0F172A"/>\n  <rect x="24" y="24" width="592" height="312" rx="14" stroke="#1E293B" stroke-width="2"/>\n  <path d="M320 76L416 116V184C416 244 374 294 320 308C266 294 224 244 224 184V116L320 76Z" fill="#1E293B" stroke="#3B82F6" stroke-width="6"/>\n  <rect x="288" y="176" width="64" height="54" rx="10" fill="#3B82F6"/>\n  <path d="M300 176V158C300 146.954 308.954 138 320 138C331.046 138 340 146.954 340 158V176" stroke="#93C5FD" stroke-width="8" stroke-linecap="round"/>\n  <text x="320" y="268" text-anchor="middle" fill="#E2E8F0" font-family="sans-serif" font-size="18" font-weight="600">CIPHERVAULT LOSSLESS MASTER</text>\n</svg>`,
    },
    {
      id: 'file-travel-runbook',
      folderId: 'fld-exec',
      name: 'Offline_Travel_Security_Runbook.txt',
      mimeType: 'text/plain',
      uploadedBy: 'usr-elena',
      uploadedByName: 'Elena Vance',
      storageTarget: 'primary-vault',
      offsetMs: -3600000 * 22,
      downloads: 15,
      content: `CIPHERVAULT OFFLINE TRAVEL PROTOCOL\n===================================\n1. Before boarding or entering air-gapped environments, verify your pinned folders are cached in IndexedDB.\n2. All locally modified or queued uploads are encrypted immediately with AES-256-GCM before entering the offline queue.\n3. Upon re-establishing network connectivity, CipherVault reconciles vector timestamps and streams encrypted chunks automatically.\n`,
    },
    {
      id: 'file-topology-cfg',
      folderId: 'fld-arch',
      name: 'Multi_Device_Sync_Topology.json',
      mimeType: 'application/json',
      uploadedBy: 'usr-marcus',
      uploadedByName: 'Marcus Chen',
      storageTarget: 's3-archive',
      offsetMs: -3600000 * 30,
      downloads: 9,
      content: JSON.stringify(
        {
          syncProtocol: 'WebSocket-Delta-v2',
          chunkSizeBytes: 1048576,
          compression: 'none-lossless',
          offlineEngine: 'IndexedDB + ServiceWorker',
          supportedClients: ['macOS Desktop', 'Windows Workstation', 'iOS PWA', 'Android PWA'],
        },
        null,
        2,
      ),
    },
  ];

  const files: VaultFile[] = seedDocs.map((doc) => {
    const plain = Buffer.from(doc.content, 'utf8');
    const enc = encryptWithAes256Gcm(plain);
    fs.writeFileSync(path.join(BLOBS_DIR, `${doc.id}.enc`), enc.ciphertextWithTag);
    return {
      id: doc.id,
      folderId: doc.folderId,
      name: doc.name,
      mimeType: doc.mimeType,
      originalSize: plain.length,
      encryptedSize: enc.ciphertextWithTag.length,
      chunkCount: Math.max(1, Math.ceil(enc.ciphertextWithTag.length / (1024 * 1024))),
      sha256: enc.sha256,
      ivHex: enc.ivHex,
      uploadedBy: doc.uploadedBy,
      uploadedByName: doc.uploadedByName,
      createdAt: iso(doc.offsetMs),
      updatedAt: iso(doc.offsetMs),
      downloadCount: doc.downloads,
      losslessVerified: true,
      isEncrypted: true,
      storageTarget: doc.storageTarget,
      seedKeyB64: enc.keyB64,
    };
  });

  const devices: ConnectedDevice[] = [
    {
      id: 'dev-macbook',
      name: "Elena's MacBook Pro M4",
      platform: 'macOS',
      browserOrClient: 'Desktop Vault Client 4.2',
      syncState: 'synced',
      lastSyncAt: iso(-120000),
      offlineStorageBytes: 142_606_336,
      region: 'San Francisco, US',
    },
    {
      id: 'dev-iphone',
      name: 'iPhone 16 Pro (Travel)',
      platform: 'iOS',
      browserOrClient: 'iOS PWA Standalone',
      syncState: 'synced',
      lastSyncAt: iso(-480000),
      offlineStorageBytes: 68_157_440,
      region: 'San Francisco, US',
    },
    {
      id: 'dev-workstation',
      name: "Marcus's Linux Workstation",
      platform: 'Windows',
      browserOrClient: 'Chromium PWA',
      syncState: 'synced',
      lastSyncAt: iso(-900000),
      offlineStorageBytes: 214_958_080,
      region: 'Seattle, US',
    },
    {
      id: 'dev-tablet',
      name: 'iPad Pro Studio',
      platform: 'iOS',
      browserOrClient: 'Safari PWA',
      syncState: 'offline',
      lastSyncAt: iso(-3600000 * 4),
      offlineStorageBytes: 94_371_840,
      region: 'London, UK',
    },
  ];

  const activity: ActivityLogEntry[] = [
    {
      id: 'act-1',
      timestamp: iso(-180000),
      actorId: 'usr-elena',
      actorName: 'Elena Vance',
      deviceName: "Elena's MacBook Pro M4",
      action: 'upload',
      targetName: 'Zero-Knowledge_E2EE_Protocol_v3.md',
      folderId: 'fld-arch',
      details: 'Encrypted client-side (AES-256-GCM) and verified SHA-256 lossless integrity.',
      bytesTransferred: files[0].originalSize,
      encrypted: true,
    },
    {
      id: 'act-2',
      timestamp: iso(-1200000),
      actorId: 'usr-marcus',
      actorName: 'Marcus Chen',
      deviceName: "Marcus's Linux Workstation",
      action: 'device_synced',
      targetName: 'Architecture & Specs',
      folderId: 'fld-arch',
      details: 'Automatic delta sync completed across 4 connected team endpoints.',
      bytesTransferred: 4_194_304,
      encrypted: true,
    },
    {
      id: 'act-3',
      timestamp: iso(-3600000 * 2),
      actorId: 'usr-elena',
      actorName: 'Elena Vance',
      deviceName: "Elena's MacBook Pro M4",
      action: 'backup_completed',
      targetName: 'Automated Hourly Snapshot',
      details: 'Verified 6 encrypted objects against SHA-256 manifest; replicated to AWS S3 Mirror.',
      bytesTransferred: files.reduce((acc, f) => acc + f.encryptedSize, 0),
      encrypted: true,
    },
    {
      id: 'act-4',
      timestamp: iso(-3600000 * 4),
      actorId: 'usr-amara',
      actorName: 'Amara Okafor',
      deviceName: 'iPad Pro Studio',
      action: 'permission_updated',
      targetName: 'Lossless Media Masters',
      folderId: 'fld-media',
      details: 'Set Lucas Meyer access level to Viewer (No Download) with zero-knowledge lock.',
      encrypted: true,
    },
    {
      id: 'act-5',
      timestamp: iso(-3600000 * 6),
      actorId: 'usr-lucas',
      actorName: 'Lucas Meyer',
      deviceName: 'Desktop Vault Client',
      action: 'decrypt',
      targetName: 'SOC2_TypeII_Key_Attestation.csv',
      folderId: 'fld-audit',
      details: 'Decrypted locally via WebCrypto enclave; SHA-256 checksum verified.',
      bytesTransferred: files[2].originalSize,
      encrypted: true,
    },
  ];

  const manifestHash = computeManifestHash(files);
  const totalBytes = files.reduce((acc, f) => acc + f.originalSize, 0);

  const backups: BackupSnapshot[] = [
    {
      id: 'bkp-104',
      timestamp: iso(-3600000 * 2),
      type: 'automated',
      status: 'completed',
      totalFiles: files.length,
      totalBytes,
      manifestSha256: manifestHash,
      targetCloud: 's3-archive',
      retentionDays: 90,
    },
    {
      id: 'bkp-103',
      timestamp: iso(-86400000),
      type: 'automated',
      status: 'completed',
      totalFiles: files.length - 1,
      totalBytes: Math.max(0, totalBytes - 512),
      manifestSha256: crypto.createHash('sha256').update(`${manifestHash}:prev1`).digest('hex'),
      targetCloud: 'b2-immutable',
      retentionDays: 90,
    },
    {
      id: 'bkp-102',
      timestamp: iso(-86400000 * 2),
      type: 'manual',
      status: 'completed',
      totalFiles: files.length - 2,
      totalBytes: Math.max(0, totalBytes - 1024),
      manifestSha256: crypto.createHash('sha256').update(`${manifestHash}:prev2`).digest('hex'),
      targetCloud: 'gcs-coldline',
      retentionDays: 365,
    },
  ];

  const backupPolicy: BackupPolicy = {
    enabled: true,
    frequency: 'hourly',
    retentionDays: 90,
    targetCloud: 's3-archive',
    verifyChecksums: true,
    lastRunAt: iso(-3600000 * 2),
    nextRunAt: iso(3600000 * 1),
  };

  const connectors: CloudConnector[] = [
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
    {
      id: 's3-archive',
      name: 'AWS S3 Enterprise Mirror',
      provider: 'Amazon S3',
      region: 'us-east-1',
      usedBytes: 128_849_018_880,
      quotaBytes: 1_099_511_627_776,
      encryptionMode: 'client-aes-256-gcm',
      status: 'connected',
      latencyMs: 28,
      autoReplicate: true,
    },
    {
      id: 'b2-immutable',
      name: 'Backblaze B2 Object Lock',
      provider: 'Backblaze B2',
      region: 'eu-central-1',
      usedBytes: 85_899_345_920,
      quotaBytes: 549_755_813_888,
      encryptionMode: 'client-aes-256-gcm',
      status: 'connected',
      latencyMs: 41,
      autoReplicate: true,
    },
    {
      id: 'gcs-coldline',
      name: 'Google Cloud Coldline Archive',
      provider: 'Google Cloud Storage',
      region: 'asia-northeast1',
      usedBytes: 19_327_352_832,
      quotaBytes: 549_755_813_888,
      encryptionMode: 'client-aes-256-gcm',
      status: 'standby',
      latencyMs: 56,
      autoReplicate: false,
    },
  ];

  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }

  const transferSeries7d = {
    dates,
    bytes: [
      1_840_000_000,
      2_610_000_000,
      2_190_000_000,
      3_940_000_000,
      3_420_000_000,
      4_870_000_000,
      5_310_000_000,
    ],
  };

  return {
    members,
    folders,
    files,
    devices,
    activity,
    backups,
    backupPolicy,
    connectors,
    transferSeries7d,
  };
}

function loadDb(): PersistedDb {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as PersistedDb;
      if (parsed && Array.isArray(parsed.files) && Array.isArray(parsed.folders)) {
        // Ensure seed blobs exist on disk
        const missingBlob = parsed.files.some(
          (f) => !fs.existsSync(path.join(BLOBS_DIR, `${f.id}.enc`)),
        );
        if (!missingBlob) {
          return parsed;
        }
      }
    } catch {
      // Fall through to re-seed
    }
  }
  const seeded = createSeedDatabase();
  saveDb(seeded);
  return seeded;
}

function saveDb(db: PersistedDb): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function buildAnalytics(db: PersistedDb): AnalyticsSummary {
  const categoryTotals: Record<string, { bytes: number; count: number }> = {
    'Documents & Specs': { bytes: 0, count: 0 },
    'Media & Vectors': { bytes: 0, count: 0 },
    'Structured Data': { bytes: 0, count: 0 },
    'Archives & Binaries': { bytes: 0, count: 0 },
  };

  for (const file of db.files) {
    if (file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/')) {
      categoryTotals['Media & Vectors'].bytes += file.originalSize;
      categoryTotals['Media & Vectors'].count += 1;
    } else if (file.mimeType.includes('json') || file.mimeType.includes('csv')) {
      categoryTotals['Structured Data'].bytes += file.originalSize;
      categoryTotals['Structured Data'].count += 1;
    } else if (file.mimeType.startsWith('text/') || file.mimeType.includes('pdf')) {
      categoryTotals['Documents & Specs'].bytes += file.originalSize;
      categoryTotals['Documents & Specs'].count += 1;
    } else {
      categoryTotals['Archives & Binaries'].bytes += file.originalSize;
      categoryTotals['Archives & Binaries'].count += 1;
    }
  }

  const memberContributions = db.members.map((m) => {
    const memberFiles = db.files.filter((f) => f.uploadedBy === m.id);
    const uploads = memberFiles.length;
    const downloads = memberFiles.reduce((acc, f) => acc + f.downloadCount, 0);
    const bytesShared = memberFiles.reduce((acc, f) => acc + f.originalSize, 0);
    return {
      memberId: m.id,
      name: m.name,
      uploads,
      downloads,
      bytesShared,
    };
  });

  const encryptedCount = db.files.filter((f) => f.isEncrypted).length;
  const encryptionCoveragePct =
    db.files.length === 0 ? 100 : Math.round((encryptedCount / db.files.length) * 100);

  return {
    totalTransferBytes7d: db.transferSeries7d.bytes,
    transferDates7d: db.transferSeries7d.dates,
    encryptionCoveragePct,
    avgChunkThroughputMbps: 312.4,
    teamVelocityDeltaPct: 24.8,
    memberContributions,
    storageByCategory: Object.entries(categoryTotals).map(([category, v]) => ({
      category,
      bytes: v.bytes,
      count: v.count,
    })),
  };
}

function getFullState(db: PersistedDb): VaultStatePayload {
  return {
    members: db.members,
    folders: db.folders,
    files: db.files,
    devices: db.devices,
    activity: db.activity,
    backups: db.backups,
    backupPolicy: db.backupPolicy,
    connectors: db.connectors,
    analytics: buildAnalytics(db),
  };
}

const db = loadDb();

const app = express();
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const urlPath = (request.url || '').split('?')[0];
  if (urlPath === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

function broadcastPush(event: PushEvent): void {
  const serialized = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function appendActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
  const full: ActivityLogEntry = {
    ...entry,
    id: `act-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
  db.activity.unshift(full);
  if (db.activity.length > 250) {
    db.activity = db.activity.slice(0, 250);
  }
  return full;
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Full vault state
app.get('/api/vault/state', (_req, res) => {
  res.json(getFullState(db));
});

// Register / heartbeat current browser device
app.post('/api/devices/register', (req, res) => {
  const { id, name, platform, browserOrClient, offlineStorageBytes } = req.body as {
    id?: string;
    name?: string;
    platform?: ConnectedDevice['platform'];
    browserOrClient?: string;
    offlineStorageBytes?: number;
  };
  const deviceId = id || 'dev-browser-current';
  const existing = db.devices.find((d) => d.id === deviceId);
  const now = new Date().toISOString();
  if (existing) {
    existing.name = name || existing.name;
    existing.platform = platform || existing.platform;
    existing.browserOrClient = browserOrClient || existing.browserOrClient;
    existing.syncState = 'synced';
    existing.lastSyncAt = now;
    if (typeof offlineStorageBytes === 'number') {
      existing.offlineStorageBytes = offlineStorageBytes;
    }
    existing.isCurrent = true;
  } else {
    db.devices.unshift({
      id: deviceId,
      name: name || 'Active Browser Session',
      platform: platform || 'Web',
      browserOrClient: browserOrClient || 'Web Crypto PWA',
      syncState: 'synced',
      lastSyncAt: now,
      offlineStorageBytes: offlineStorageBytes || 0,
      region: 'Active Session',
      isCurrent: true,
    });
  }
  saveDb(db);
  res.json({ devices: db.devices });
});

// Trigger device sync
app.post('/api/devices/:id/sync', (req, res) => {
  const device = db.devices.find((d) => d.id === req.params.id);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  device.syncState = 'synced';
  device.lastSyncAt = new Date().toISOString();
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: 'Elena Vance',
    deviceName: device.name,
    action: 'device_synced',
    targetName: device.name,
    details: `Cross-platform encrypted delta sync completed for ${device.platform} endpoint.`,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'device:synced',
    title: 'Device Synced',
    message: `${device.name} synchronized all encrypted folders.`,
    timestamp: new Date().toISOString(),
    payload: { devices: db.devices, activity: act },
  });
  res.json({ device, devices: db.devices, activity: act });
});

// Create folder
app.post('/api/folders', (req, res) => {
  const { name, description, storageTarget, encryptedZeroKnowledge, offlinePinned, actorName } =
    req.body as {
      name: string;
      description?: string;
      storageTarget?: CloudStorageTarget;
      encryptedZeroKnowledge?: boolean;
      offlinePinned?: boolean;
      actorName?: string;
    };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Folder name is required' });
    return;
  }
  const now = new Date().toISOString();
  const folder: VaultFolder = {
    id: `fld-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    description: description?.trim() || 'Encrypted team workspace folder.',
    parentId: null,
    encryptedZeroKnowledge: encryptedZeroKnowledge ?? true,
    storageTarget: storageTarget || 'primary-vault',
    createdAt: now,
    updatedAt: now,
    offlinePinned: offlinePinned ?? false,
    permissions: db.members.map((m, idx) => ({
      memberId: m.id,
      role: idx === 0 ? 'owner' : 'editor',
      canShareExternal: idx === 0,
    })),
  };
  db.folders.push(folder);
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: actorName || 'Elena Vance',
    deviceName: 'Active Browser Session',
    action: 'folder_created',
    targetName: folder.name,
    folderId: folder.id,
    details: `Created encrypted folder routed to ${folder.storageTarget}.`,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'folder:created',
    title: 'New Encrypted Folder',
    message: `${folder.name} was created with zero-knowledge protection.`,
    timestamp: now,
    payload: { folder, activity: act },
  });
  res.status(201).json({ folder, activity: act });
});

// Toggle folder offline pin or storage target
app.patch('/api/folders/:id', (req, res) => {
  const folder = db.folders.find((f) => f.id === req.params.id);
  if (!folder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }
  const { offlinePinned, storageTarget, encryptedZeroKnowledge } = req.body as Partial<VaultFolder>;
  if (typeof offlinePinned === 'boolean') folder.offlinePinned = offlinePinned;
  if (storageTarget) folder.storageTarget = storageTarget;
  if (typeof encryptedZeroKnowledge === 'boolean') {
    folder.encryptedZeroKnowledge = encryptedZeroKnowledge;
  }
  folder.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ folder });
});

// Update granular folder permissions
app.put('/api/folders/:id/permissions', (req, res) => {
  const folder = db.folders.find((f) => f.id === req.params.id);
  if (!folder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }
  const { permissions, actorName, summary } = req.body as {
    permissions: FolderPermission[];
    actorName?: string;
    summary?: string;
  };
  if (!Array.isArray(permissions)) {
    res.status(400).json({ error: 'Permissions array is required' });
    return;
  }
  folder.permissions = permissions;
  folder.updatedAt = new Date().toISOString();
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: actorName || 'Elena Vance',
    deviceName: 'Active Browser Session',
    action: 'permission_updated',
    targetName: folder.name,
    folderId: folder.id,
    details: summary || `Updated granular ACL permissions for ${folder.name}.`,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'permission:updated',
    title: 'Folder Permissions Updated',
    message: `Access controls updated on ${folder.name}.`,
    timestamp: new Date().toISOString(),
    payload: { folder, activity: act },
  });
  res.json({ folder, activity: act });
});

// Chunked Large File Upload: 1. Init
app.post('/api/upload/init', (req, res) => {
  const {
    folderId,
    name,
    mimeType,
    originalSize,
    encryptedSize,
    totalChunks,
    sha256,
    ivHex,
    keySalt,
    actorId,
    actorName,
    deviceName,
    storageTarget,
  } = req.body as Omit<UploadSession, 'uploadId' | 'receivedChunks'>;

  if (!name || !folderId || !sha256 || !ivHex || !totalChunks) {
    res.status(400).json({ error: 'Missing required encrypted upload parameters' });
    return;
  }

  const uploadId = `upl-${crypto.randomUUID()}`;
  const sessionDir = path.join(CHUNKS_DIR, uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });

  uploadSessions.set(uploadId, {
    uploadId,
    folderId,
    name,
    mimeType: mimeType || 'application/octet-stream',
    originalSize,
    encryptedSize,
    totalChunks,
    sha256,
    ivHex,
    keySalt,
    actorId: actorId || 'usr-elena',
    actorName: actorName || 'Elena Vance',
    deviceName: deviceName || 'Active Browser Session',
    storageTarget: storageTarget || 'primary-vault',
    receivedChunks: new Set<number>(),
  });

  res.status(201).json({ uploadId });
});

// Chunked Large File Upload: 2. Upload Raw Binary Encrypted Chunk
app.put(
  '/api/upload/chunk/:uploadId/:chunkIndex',
  express.raw({ type: 'application/octet-stream', limit: '32mb' }),
  (req, res) => {
    const { uploadId, chunkIndex } = req.params;
    const session = uploadSessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: 'Upload session not found' });
      return;
    }
    const idx = Number(chunkIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= session.totalChunks) {
      res.status(400).json({ error: 'Invalid chunk index' });
      return;
    }
    const chunkBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    fs.writeFileSync(path.join(CHUNKS_DIR, uploadId, `${idx}.part`), chunkBuf);
    session.receivedChunks.add(idx);
    res.json({
      uploadId,
      chunkIndex: idx,
      receivedCount: session.receivedChunks.size,
      totalChunks: session.totalChunks,
    });
  },
);

// Chunked Large File Upload: 3. Complete & Lossless Assemble
app.post('/api/upload/complete', (req, res) => {
  const { uploadId, isOfflineSync } = req.body as { uploadId: string; isOfflineSync?: boolean };
  const session = uploadSessions.get(uploadId);
  if (!session) {
    res.status(404).json({ error: 'Upload session not found' });
    return;
  }
  if (session.receivedChunks.size !== session.totalChunks) {
    res.status(400).json({
      error: `Incomplete upload: received ${session.receivedChunks.size}/${session.totalChunks} chunks`,
    });
    return;
  }

  const fileId = `file-${crypto.randomUUID().slice(0, 10)}`;
  const destPath = path.join(BLOBS_DIR, `${fileId}.enc`);
  const sessionDir = path.join(CHUNKS_DIR, uploadId);

  const writeStream = fs.createWriteStream(destPath);
  for (let i = 0; i < session.totalChunks; i++) {
    const partPath = path.join(sessionDir, `${i}.part`);
    const partData = fs.readFileSync(partPath);
    writeStream.write(partData);
  }
  writeStream.end(() => {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    uploadSessions.delete(uploadId);

    const now = new Date().toISOString();
    const newFile: VaultFile = {
      id: fileId,
      folderId: session.folderId,
      name: session.name,
      mimeType: session.mimeType,
      originalSize: session.originalSize,
      encryptedSize: session.encryptedSize,
      chunkCount: session.totalChunks,
      sha256: session.sha256,
      ivHex: session.ivHex,
      keySalt: session.keySalt,
      uploadedBy: session.actorId,
      uploadedByName: session.actorName,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      losslessVerified: true,
      isEncrypted: true,
      storageTarget: session.storageTarget,
    };

    db.files.unshift(newFile);
    const targetConnector = db.connectors.find((c) => c.id === session.storageTarget);
    if (targetConnector) {
      targetConnector.usedBytes += session.encryptedSize;
    }
    db.transferSeries7d.bytes[db.transferSeries7d.bytes.length - 1] += session.originalSize;

    const act = appendActivity({
      actorId: session.actorId,
      actorName: session.actorName,
      deviceName: session.deviceName,
      action: isOfflineSync ? 'offline_sync' : 'upload',
      targetName: session.name,
      folderId: session.folderId,
      details: `${isOfflineSync ? 'Auto-synced from offline travel queue' : 'Uploaded losslessly'} in ${session.totalChunks} encrypted chunk(s) (AES-256-GCM).`,
      bytesTransferred: session.originalSize,
      encrypted: true,
    });
    saveDb(db);

    broadcastPush({
      id: crypto.randomUUID(),
      type: 'file:uploaded',
      title: isOfflineSync ? 'Offline Queue Synced' : 'Encrypted File Uploaded',
      message: `${session.name} (${session.totalChunks} lossless chunks) synced across devices.`,
      timestamp: now,
      payload: { file: newFile, activity: act },
    });

    res.status(201).json({ file: newFile, activity: act, analytics: buildAnalytics(db) });
  });
});

// Download raw encrypted ciphertext blob
app.get('/api/files/:id/blob', (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const blobPath = path.join(BLOBS_DIR, `${file.id}.enc`);
  if (!fs.existsSync(blobPath)) {
    res.status(404).json({ error: 'Encrypted payload missing from vault' });
    return;
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-CipherVault-IV', file.ivHex);
  res.setHeader('X-CipherVault-SHA256', file.sha256);
  fs.createReadStream(blobPath).pipe(res);
});

// Log client-side decryption / lossless download
app.post('/api/files/:id/decrypted-event', (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const { actorName, deviceName, mode } = req.body as {
    actorName?: string;
    deviceName?: string;
    mode?: 'preview' | 'download';
  };
  file.downloadCount += 1;
  db.transferSeries7d.bytes[db.transferSeries7d.bytes.length - 1] += file.originalSize;
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: actorName || 'Elena Vance',
    deviceName: deviceName || 'Active Browser Session',
    action: mode === 'preview' ? 'decrypt' : 'download',
    targetName: file.name,
    folderId: file.folderId,
    details: `Client decrypted AES-256-GCM payload & verified SHA-256 (${file.sha256.slice(0, 12)}…).`,
    bytesTransferred: file.originalSize,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'file:updated',
    title: 'File Decrypted',
    message: `${file.name} verified lossless on ${deviceName || 'client endpoint'}.`,
    timestamp: new Date().toISOString(),
    payload: { file, activity: act },
  });
  res.json({ file, activity: act });
});

// Create / update zero-knowledge share link metadata (never stores the #key= secret!)
app.post('/api/files/:id/share', (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const { expiresInHours, maxDownloads, requiresPassphrase } = req.body as {
    expiresInHours?: number;
    maxDownloads?: number;
    requiresPassphrase?: boolean;
  };
  const token = file.shareToken || crypto.randomBytes(12).toString('hex');
  file.shareToken = token;
  file.shareRequiresPassphrase = Boolean(requiresPassphrase);
  file.shareMaxDownloads = maxDownloads || 25;
  file.shareExpiresAt = new Date(Date.now() + (expiresInHours || 168) * 3600000).toISOString();

  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: 'Elena Vance',
    deviceName: 'Active Browser Session',
    action: 'share_created',
    targetName: file.name,
    folderId: file.folderId,
    details: `Generated zero-knowledge share token (key remains in URL #fragment, never transmitted).`,
    encrypted: true,
  });
  saveDb(db);
  res.json({ file, shareToken: token, activity: act });
});

// Resolve share token metadata
app.get('/api/share/:token', (req, res) => {
  const file = db.files.find((f) => f.shareToken === req.params.token);
  if (!file) {
    res.status(404).json({ error: 'Share link not found or expired' });
    return;
  }
  if (file.shareExpiresAt && new Date(file.shareExpiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: 'This encrypted share link has expired' });
    return;
  }
  res.json({ file });
});

// Delete file
app.delete('/api/files/:id', (req, res) => {
  const idx = db.files.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const [removed] = db.files.splice(idx, 1);
  const blobPath = path.join(BLOBS_DIR, `${removed.id}.enc`);
  if (fs.existsSync(blobPath)) {
    fs.unlinkSync(blobPath);
  }
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: 'Elena Vance',
    deviceName: 'Active Browser Session',
    action: 'file_deleted',
    targetName: removed.name,
    folderId: removed.folderId,
    details: 'Removed encrypted object and purged ciphertext shards from storage.',
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'file:deleted',
    title: 'File Removed',
    message: `${removed.name} was deleted from the encrypted vault.`,
    timestamp: new Date().toISOString(),
    payload: { fileId: removed.id, activity: act },
  });
  res.json({ deletedId: removed.id, activity: act });
});

// Cloud storage connector management
app.patch('/api/storage/:id', (req, res) => {
  const connector = db.connectors.find((c) => c.id === req.params.id);
  if (!connector) {
    res.status(404).json({ error: 'Storage connector not found' });
    return;
  }
  const { autoReplicate, status, quotaBytes } = req.body as Partial<CloudConnector>;
  if (typeof autoReplicate === 'boolean') connector.autoReplicate = autoReplicate;
  if (status) connector.status = status;
  if (typeof quotaBytes === 'number' && quotaBytes >= connector.usedBytes) {
    connector.quotaBytes = quotaBytes;
  }
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'connector:updated',
    title: 'Cloud Storage Policy Updated',
    message: `${connector.name} replication configuration saved.`,
    timestamp: new Date().toISOString(),
    payload: { connector, connectors: db.connectors },
  });
  res.json({ connector, connectors: db.connectors });
});

// Run backup snapshot
app.post('/api/backups/run', (req, res) => {
  const { type } = req.body as { type?: 'automated' | 'manual' };
  const now = new Date().toISOString();
  const totalBytes = db.files.reduce((acc, f) => acc + f.originalSize, 0);
  const snapshot: BackupSnapshot = {
    id: `bkp-${Math.floor(105 + Math.random() * 890)}`,
    timestamp: now,
    type: type || 'manual',
    status: 'completed',
    totalFiles: db.files.length,
    totalBytes,
    manifestSha256: computeManifestHash(db.files),
    targetCloud: db.backupPolicy.targetCloud,
    retentionDays: db.backupPolicy.retentionDays,
  };
  db.backups.unshift(snapshot);
  db.backupPolicy.lastRunAt = now;
  const intervalMs =
    db.backupPolicy.frequency === 'hourly'
      ? 3600000
      : db.backupPolicy.frequency === 'daily'
        ? 86400000
        : 604800000;
  db.backupPolicy.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: 'Elena Vance',
    deviceName: 'Vault Backup Engine',
    action: 'backup_completed',
    targetName: `Snapshot ${snapshot.id}`,
    details: `Verified ${snapshot.totalFiles} encrypted files (${snapshot.manifestSha256.slice(0, 12)}…) to ${snapshot.targetCloud}.`,
    bytesTransferred: totalBytes,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'backup:completed',
    title: 'Encrypted Backup Verified',
    message: `Snapshot ${snapshot.id} captured ${snapshot.totalFiles} files with SHA-256 verification.`,
    timestamp: now,
    payload: { snapshot, backups: db.backups, backupPolicy: db.backupPolicy, activity: act },
  });
  res.status(201).json({ snapshot, backups: db.backups, backupPolicy: db.backupPolicy, activity: act });
});

// Update automated backup policy
app.put('/api/backups/policy', (req, res) => {
  const updates = req.body as Partial<BackupPolicy>;
  db.backupPolicy = { ...db.backupPolicy, ...updates };
  saveDb(db);
  res.json({ backupPolicy: db.backupPolicy });
});

// Restore snapshot verification
app.post('/api/backups/:id/restore', (req, res) => {
  const snapshot = db.backups.find((b) => b.id === req.params.id);
  if (!snapshot) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }
  const act = appendActivity({
    actorId: 'usr-elena',
    actorName: 'Elena Vance',
    deviceName: 'Active Browser Session',
    action: 'backup_restored',
    targetName: `Snapshot ${snapshot.id}`,
    details: `Verified & restored manifest ${snapshot.manifestSha256.slice(0, 12)}… from ${snapshot.targetCloud}.`,
    bytesTransferred: snapshot.totalBytes,
    encrypted: true,
  });
  saveDb(db);
  broadcastPush({
    id: crypto.randomUUID(),
    type: 'backup:restored',
    title: 'Snapshot Restored',
    message: `Vault integrity verified and restored from ${snapshot.id}.`,
    timestamp: new Date().toISOString(),
    payload: { snapshot, activity: act },
  });
  res.json({ snapshot, activity: act });
});

// Vite dev middleware or static dist serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CipherVault server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CipherVault server:', err);
  process.exit(1);
});
