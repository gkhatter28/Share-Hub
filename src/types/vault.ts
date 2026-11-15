export type FolderRole = 'owner' | 'editor' | 'downloader' | 'viewer' | 'revoked';

export type CloudStorageTarget =
  | 'primary-vault'
  | 's3-archive'
  | 'b2-immutable'
  | 'gcs-coldline';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  roleTitle: string;
  avatarUrl?: string;
  publicKeyFingerprint: string;
  department: string;
}

export interface FolderPermission {
  memberId: string;
  role: FolderRole;
  canShareExternal: boolean;
  expiresAt?: string;
}

export interface VaultFolder {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  encryptedZeroKnowledge: boolean;
  storageTarget: CloudStorageTarget;
  createdAt: string;
  updatedAt: string;
  permissions: FolderPermission[];
  offlinePinned: boolean;
}

export interface VaultFile {
  id: string;
  folderId: string;
  name: string;
  mimeType: string;
  originalSize: number;
  encryptedSize: number;
  chunkCount: number;
  sha256: string;
  ivHex: string;
  keySalt?: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
  losslessVerified: boolean;
  isEncrypted: boolean;
  storageTarget: CloudStorageTarget;
  shareToken?: string;
  shareRequiresPassphrase?: boolean;
  shareExpiresAt?: string;
  shareMaxDownloads?: number;
  /** Optional demo key stored locally for seeded sample files */
  seedKeyB64?: string;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  platform: 'macOS' | 'Windows' | 'iOS' | 'Android' | 'Web';
  browserOrClient: string;
  syncState: 'synced' | 'syncing' | 'offline';
  lastSyncAt: string;
  offlineStorageBytes: number;
  region: string;
  isCurrent?: boolean;
}

export type ActivityAction =
  | 'upload'
  | 'download'
  | 'decrypt'
  | 'share_created'
  | 'permission_updated'
  | 'backup_completed'
  | 'backup_restored'
  | 'device_synced'
  | 'folder_created'
  | 'file_deleted'
  | 'offline_sync';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  deviceName: string;
  action: ActivityAction;
  targetName: string;
  folderId?: string;
  details: string;
  bytesTransferred?: number;
  encrypted: boolean;
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  type: 'automated' | 'manual';
  status: 'completed' | 'verifying';
  totalFiles: number;
  totalBytes: number;
  manifestSha256: string;
  targetCloud: CloudStorageTarget;
  retentionDays: number;
}

export interface BackupPolicy {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly';
  retentionDays: number;
  targetCloud: CloudStorageTarget;
  verifyChecksums: boolean;
  lastRunAt: string;
  nextRunAt: string;
}

export interface CloudConnector {
  id: CloudStorageTarget;
  name: string;
  provider: string;
  region: string;
  usedBytes: number;
  quotaBytes: number;
  encryptionMode: 'client-aes-256-gcm';
  status: 'connected' | 'standby';
  latencyMs: number;
  autoReplicate: boolean;
}

export interface AnalyticsSummary {
  totalTransferBytes7d: number[];
  transferDates7d: string[];
  encryptionCoveragePct: number;
  avgChunkThroughputMbps: number;
  teamVelocityDeltaPct: number;
  memberContributions: Array<{
    memberId: string;
    name: string;
    uploads: number;
    downloads: number;
    bytesShared: number;
  }>;
  storageByCategory: Array<{
    category: string;
    bytes: number;
    count: number;
  }>;
}

export interface VaultStatePayload {
  members: TeamMember[];
  folders: VaultFolder[];
  files: VaultFile[];
  devices: ConnectedDevice[];
  activity: ActivityLogEntry[];
  backups: BackupSnapshot[];
  backupPolicy: BackupPolicy;
  connectors: CloudConnector[];
  analytics: AnalyticsSummary;
}

export interface PushEvent {
  id: string;
  type:
    | 'file:uploaded'
    | 'file:deleted'
    | 'file:updated'
    | 'folder:created'
    | 'permission:updated'
    | 'backup:completed'
    | 'backup:restored'
    | 'device:synced'
    | 'connector:updated'
    | 'activity:new';
  title: string;
  message: string;
  timestamp: string;
  payload?: unknown;
}
