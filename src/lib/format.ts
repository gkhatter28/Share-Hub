import type { ActivityAction, CloudStorageTarget, ConnectedDevice, FolderRole } from '@/src/types/vault';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : dm)} ${sizes[i]}`;
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ROLE_LABELS: Record<FolderRole, string> = {
  owner: 'Owner (Full Control)',
  editor: 'Editor (Upload & Modify)',
  downloader: 'Downloader (Decrypt & Save)',
  viewer: 'Viewer (Preview Only)',
  revoked: 'Revoked (No Access)',
};

export const STORAGE_LABELS: Record<CloudStorageTarget, string> = {
  'primary-vault': 'CipherVault NVMe',
  's3-archive': 'AWS S3 Mirror',
  'b2-immutable': 'Backblaze B2 Lock',
  'gcs-coldline': 'GCP Coldline',
};

export const ACTION_LABELS: Record<ActivityAction, string> = {
  upload: 'Encrypted Upload',
  download: 'Lossless Download',
  decrypt: 'Client Decryption',
  share_created: 'Zero-Knowledge Link',
  permission_updated: 'ACL Permission Update',
  backup_completed: 'Backup Snapshot',
  backup_restored: 'Snapshot Restored',
  device_synced: 'Device Sync',
  folder_created: 'Folder Created',
  file_deleted: 'Object Purged',
  offline_sync: 'Offline Queue Synced',
};

export function detectCurrentDevice(): {
  id: string;
  name: string;
  platform: ConnectedDevice['platform'];
  browserOrClient: string;
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let platform: ConnectedDevice['platform'] = 'Web';
  let name = 'Desktop Browser';
  if (/iphone|ipad|ipod/i.test(ua)) {
    platform = 'iOS';
    name = /ipad/i.test(ua) ? 'iPad Safari Client' : 'iPhone Safari Client';
  } else if (/android/i.test(ua)) {
    platform = 'Android';
    name = 'Android PWA Client';
  } else if (/mac os x|macintosh/i.test(ua)) {
    platform = 'macOS';
    name = 'macOS Web Client';
  } else if (/windows/i.test(ua)) {
    platform = 'Windows';
    name = 'Windows Web Client';
  }

  let browser = 'Modern Web Crypto';
  if (/edg/i.test(ua)) browser = 'Edge WebCrypto PWA';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome WebCrypto PWA';
  else if (/firefox/i.test(ua)) browser = 'Firefox WebCrypto';
  else if (/safari/i.test(ua)) browser = 'Safari WebCrypto PWA';

  let id = 'dev-browser-session';
  try {
    const existing = localStorage.getItem('ciphervault_device_id');
    if (existing) {
      id = existing;
    } else {
      id = `dev-${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem('ciphervault_device_id', id);
    }
  } catch {
    // ignore storage restriction
  }

  return { id, name, platform, browserOrClient: browser };
}
