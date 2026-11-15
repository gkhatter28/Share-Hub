const KEYRING_STORAGE_KEY = 'ciphervault_keyring_v1';

export interface StoredFileKey {
  keyB64: string;
  passphraseProtected?: boolean;
  saltHex?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function generateAes256Key(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportKeyB64Url(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  return bytesToBase64Url(new Uint8Array(raw));
}

export async function importKeyB64Url(b64u: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(b64u);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return window.crypto.subtle.importKey(
    'raw',
    copy.buffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function derivePassphraseKey(
  passphrase: string,
  saltHex?: string,
): Promise<{ key: CryptoKey; saltHex: string }> {
  const saltBytes = saltHex
    ? hexToBytes(saltHex)
    : window.crypto.getRandomValues(new Uint8Array(16));
  const saltCopy = new Uint8Array(saltBytes.byteLength);
  saltCopy.set(saltBytes);
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const derived = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy.buffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  return { key: derived, saltHex: bytesToHex(saltBytes) };
}

export async function encryptFileLossless(
  plainBuffer: ArrayBuffer,
  passphrase?: string,
): Promise<{
  ciphertext: ArrayBuffer;
  ivHex: string;
  sha256: string;
  keyB64: string;
  keySalt?: string;
}> {
  const sha256 = await sha256Hex(plainBuffer);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  let key: CryptoKey;
  let keySalt: string | undefined;
  if (passphrase && passphrase.trim().length > 0) {
    const derived = await derivePassphraseKey(passphrase.trim());
    key = derived.key;
    keySalt = derived.saltHex;
  } else {
    key = await generateAes256Key();
  }

  const keyB64 = await exportKeyB64Url(key);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBuffer,
  );

  return {
    ciphertext,
    ivHex: bytesToHex(iv),
    sha256,
    keyB64,
    keySalt,
  };
}

export async function decryptFileLossless(
  ciphertext: ArrayBuffer,
  ivHex: string,
  keyB64: string,
  expectedSha256?: string,
): Promise<{ plaintext: ArrayBuffer; verifiedSha256: string; integrityMatch: boolean }> {
  const ivRaw = hexToBytes(ivHex);
  const ivCopy = new Uint8Array(ivRaw.byteLength);
  ivCopy.set(ivRaw);
  const key = await importKeyB64Url(keyB64);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy.buffer },
    key,
    ciphertext,
  );
  const verifiedSha256 = await sha256Hex(plaintext);
  const integrityMatch = expectedSha256 ? verifiedSha256 === expectedSha256 : true;
  return { plaintext, verifiedSha256, integrityMatch };
}

export function getKeyring(): Record<string, StoredFileKey> {
  try {
    const raw = localStorage.getItem(KEYRING_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredFileKey>;
  } catch {
    return {};
  }
}

export function saveKeyToKeyring(fileId: string, entry: StoredFileKey): void {
  try {
    const ring = getKeyring();
    ring[fileId] = entry;
    localStorage.setItem(KEYRING_STORAGE_KEY, JSON.stringify(ring));
  } catch {
    // ignore quota errors
  }
}

export function getFileKeyFromKeyring(fileId: string): StoredFileKey | undefined {
  return getKeyring()[fileId];
}
