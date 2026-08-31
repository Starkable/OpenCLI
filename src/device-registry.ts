/**
 * Device credential registry for multi-tenant remote extension transport.
 *
 * Stores deviceId + tokenHash + status under a configurable JSON path
 * (OPENCLI_DEVICE_REGISTRY or ~/.opencli/devices.json).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const ENV_DEVICE_REGISTRY = 'OPENCLI_DEVICE_REGISTRY';

export type DeviceStatus = 'active' | 'revoked';

export interface DeviceRecord {
  deviceId: string;
  tokenHash: string;
  status: DeviceStatus;
  createdAt: string;
  revokedAt?: string;
  note?: string;
}

export interface DeviceRegistryFile {
  version: 1;
  devices: Record<string, DeviceRecord>;
}

export function defaultDeviceRegistryPath(): string {
  const configDir = process.env.OPENCLI_CONFIG_DIR || join(homedir(), '.opencli');
  return join(configDir, 'devices.json');
}

/** Resolved registry path (env override or default). */
export function resolveDeviceRegistryPath(overridePath?: string): string {
  if (overridePath?.trim()) return overridePath.trim();
  const fromEnv = process.env[ENV_DEVICE_REGISTRY]?.trim();
  if (fromEnv) return fromEnv;
  return defaultDeviceRegistryPath();
}

/**
 * Device credential mode is on when OPENCLI_DEVICE_REGISTRY is set,
 * or when the default/registry file already exists on disk.
 */
export function isDeviceCredentialMode(registryPath?: string): boolean {
  if (process.env[ENV_DEVICE_REGISTRY]?.trim()) return true;
  const path = resolveDeviceRegistryPath(registryPath);
  return existsSync(path);
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateDeviceId(): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  const maxUnbiasedByte = Math.floor(256 / alphabet.length) * alphabet.length;
  let id = '';
  while (id.length < 8) {
    const bytes = randomBytes(8);
    for (const byte of bytes) {
      if (byte >= maxUnbiasedByte) continue;
      id += alphabet[byte % alphabet.length];
      if (id.length === 8) break;
    }
  }
  return id;
}

export function emptyRegistry(): DeviceRegistryFile {
  return { version: 1, devices: {} };
}

export function loadDeviceRegistry(registryPath?: string): DeviceRegistryFile {
  const path = resolveDeviceRegistryPath(registryPath);
  if (!existsSync(path)) return emptyRegistry();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DeviceRegistryFile>;
    if (raw && raw.version === 1 && raw.devices && typeof raw.devices === 'object') {
      return { version: 1, devices: raw.devices as Record<string, DeviceRecord> };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw new Error(`Failed to load device registry at ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return emptyRegistry();
}

export function saveDeviceRegistry(registry: DeviceRegistryFile, registryPath?: string): string {
  const path = resolveDeviceRegistryPath(registryPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return path;
}

export interface IssueDeviceResult {
  deviceId: string;
  deviceToken: string;
  registryPath: string;
  record: DeviceRecord;
}

export function issueDevice(opts: {
  deviceId?: string;
  note?: string;
  registryPath?: string;
  now?: Date;
}): IssueDeviceResult {
  const path = resolveDeviceRegistryPath(opts.registryPath);
  const registry = loadDeviceRegistry(path);
  const deviceId = (opts.deviceId?.trim() || generateDeviceId()).trim();
  if (!deviceId) throw new Error('deviceId is required');
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
    throw new Error('deviceId must be alphanumeric (plus _ -)');
  }
  const existing = registry.devices[deviceId];
  if (existing && existing.status === 'active') {
    throw new Error(`device "${deviceId}" already exists and is active; revoke it first or choose another id`);
  }
  const deviceToken = generateDeviceToken();
  const now = (opts.now ?? new Date()).toISOString();
  const record: DeviceRecord = {
    deviceId,
    tokenHash: hashDeviceToken(deviceToken),
    status: 'active',
    createdAt: now,
    ...(opts.note ? { note: opts.note } : {}),
  };
  registry.devices[deviceId] = record;
  const registryPath = saveDeviceRegistry(registry, path);
  return { deviceId, deviceToken, registryPath, record };
}

export function revokeDevice(deviceId: string, opts: { registryPath?: string; now?: Date } = {}): DeviceRecord {
  const id = deviceId.trim();
  if (!id) throw new Error('deviceId is required');
  const path = resolveDeviceRegistryPath(opts.registryPath);
  const registry = loadDeviceRegistry(path);
  const record = registry.devices[id];
  if (!record) throw new Error(`device "${id}" not found in registry`);
  if (record.status === 'revoked') return record;
  record.status = 'revoked';
  record.revokedAt = (opts.now ?? new Date()).toISOString();
  saveDeviceRegistry(registry, path);
  return record;
}

export type DeviceAuthResult =
  | { ok: true; deviceId: string }
  | { ok: false; errorCode: 'device_credentials_required' | 'device_unknown' | 'device_revoked' | 'device_token_invalid'; error: string };

/**
 * Validate deviceId + plaintext token against the registry.
 * Reloads the file each call so revoke takes effect without daemon restart.
 */
export function authenticateDevice(
  deviceId: string | undefined,
  deviceToken: string | undefined,
  registryPath?: string,
): DeviceAuthResult {
  const id = deviceId?.trim();
  const token = deviceToken?.trim();
  if (!id || !token) {
    return {
      ok: false,
      errorCode: 'device_credentials_required',
      error: 'Remote device mode requires deviceId and deviceToken on the extension connection.',
    };
  }
  const registry = loadDeviceRegistry(registryPath);
  const record = registry.devices[id];
  if (!record) {
    return { ok: false, errorCode: 'device_unknown', error: `Unknown deviceId "${id}".` };
  }
  if (record.status === 'revoked') {
    return { ok: false, errorCode: 'device_revoked', error: `Device "${id}" has been revoked.` };
  }
  const providedHash = hashDeviceToken(token);
  const expected = Buffer.from(record.tokenHash, 'utf8');
  const actual = Buffer.from(providedHash, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, errorCode: 'device_token_invalid', error: `Invalid deviceToken for deviceId "${id}".` };
  }
  return { ok: true, deviceId: id };
}

export function listDevices(registryPath?: string): DeviceRecord[] {
  const registry = loadDeviceRegistry(registryPath);
  return Object.values(registry.devices).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}
