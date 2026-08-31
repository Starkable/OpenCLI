/**
 * Remote extension transport — shared helpers for daemon remote mode.
 *
 * Modes:
 * - Shared-token (OPENCLI_REMOTE_TOKEN): intranet MVP, unique-active kick.
 * - Device-credential (OPENCLI_DEVICE_REGISTRY / devices.json): multi-tenant,
 *   parallel connections, strict profile routing.
 *
 * CLI HTTP (/command) remains loopback-only in both remote modes.
 * See docs/guide/multi-tenant-device-credentials.md.
 */

import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isDeviceCredentialMode } from './device-registry.js';

/** Env: shared secret required on extension WS connect in shared-token remote mode. */
export const ENV_REMOTE_TOKEN = 'OPENCLI_REMOTE_TOKEN';

/** Env: bind address when remote mode is on (default 0.0.0.0). */
export const ENV_DAEMON_BIND = 'OPENCLI_DAEMON_BIND';

export function getRemoteToken(): string | undefined {
  const value = process.env[ENV_REMOTE_TOKEN]?.trim();
  return value || undefined;
}

/** Remote mode: shared token and/or device credential registry. */
export function isRemoteMode(): boolean {
  return getRemoteToken() !== undefined || isDeviceCredentialMode();
}

/** Prefer device credentials when a registry is configured/present. */
export function isDeviceRemoteMode(): boolean {
  return isDeviceCredentialMode();
}

/**
 * Unique-active kick applies only to shared-token remote mode without device registry.
 * Device mode allows parallel connections (same deviceId still replaces itself).
 */
export function isUniqueActiveRemoteMode(): boolean {
  return isRemoteMode() && !isDeviceRemoteMode();
}

export function describeRemoteAuthMode(): 'local' | 'shared-token' | 'device-credentials' {
  if (!isRemoteMode()) return 'local';
  if (isDeviceRemoteMode()) return 'device-credentials';
  return 'shared-token';
}

export function getDaemonBindHost(): string {
  if (!isRemoteMode()) return '127.0.0.1';
  const bind = process.env[ENV_DAEMON_BIND]?.trim();
  return bind || '0.0.0.0';
}

export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  return (
    addr === '127.0.0.1'
    || addr === '::1'
    || addr === '::ffff:127.0.0.1'
    || addr === 'localhost'
  );
}

/**
 * Extract shared remote token from WS upgrade or HTTP request.
 * Supports: ?token=, Authorization: Bearer, X-OpenCLI-Remote-Token
 */
export function extractRemoteToken(req: IncomingMessage): string | undefined {
  const url = req.url ?? '/';
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    const q = parsed.searchParams.get('token')?.trim();
    if (q) return q;
  } catch {
    // ignore malformed URL
  }
  const headerToken = req.headers['x-opencli-remote-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** Extract deviceId from ?deviceId= or X-OpenCLI-Device-Id. */
export function extractDeviceId(req: IncomingMessage): string | undefined {
  const url = req.url ?? '/';
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    const q = parsed.searchParams.get('deviceId')?.trim();
    if (q) return q;
  } catch {
    // ignore
  }
  const header = req.headers['x-opencli-device-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return undefined;
}

/**
 * Extract device token. Prefer ?deviceToken= / X-OpenCLI-Device-Token;
 * fall back to shared token extractors for simpler clients that only send token=.
 */
export function extractDeviceToken(req: IncomingMessage): string | undefined {
  const url = req.url ?? '/';
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    const q = parsed.searchParams.get('deviceToken')?.trim();
    if (q) return q;
  } catch {
    // ignore
  }
  const header = req.headers['x-opencli-device-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return extractRemoteToken(req);
}

export function remoteTokensMatch(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ExtensionWsAuth =
  | { ok: true; mode: 'device'; deviceId: string }
  | { ok: true; mode: 'shared' }
  | { ok: false; errorCode: string; error: string };

/**
 * Authenticate an extension WebSocket upgrade for remote mode.
 * Device credentials take precedence when deviceId is present or device mode is on.
 */
export function authenticateExtensionWs(
  req: IncomingMessage,
  opts: {
    sharedToken?: string;
    deviceMode: boolean;
    authenticateDevice: (
      deviceId: string | undefined,
      deviceToken: string | undefined,
    ) => { ok: true; deviceId: string } | { ok: false; errorCode: string; error: string };
  },
): ExtensionWsAuth {
  const deviceId = extractDeviceId(req);
  const deviceToken = extractDeviceToken(req);
  const sharedProvided = extractRemoteToken(req);

  if (opts.deviceMode) {
    // Prefer device auth when deviceId is supplied, or always require it in device mode
    // unless migrating via shared token without deviceId.
    if (deviceId || !opts.sharedToken) {
      const result = opts.authenticateDevice(deviceId, deviceToken);
      if (!result.ok) {
        return { ok: false, errorCode: result.errorCode, error: result.error };
      }
      return { ok: true, mode: 'device', deviceId: result.deviceId };
    }
  }

  if (opts.sharedToken) {
    if (!remoteTokensMatch(opts.sharedToken, sharedProvided)) {
      return {
        ok: false,
        errorCode: 'remote_token_invalid',
        error: 'Invalid or missing OPENCLI_REMOTE_TOKEN for extension WebSocket.',
      };
    }
    return { ok: true, mode: 'shared' };
  }

  if (opts.deviceMode) {
    const result = opts.authenticateDevice(deviceId, deviceToken);
    if (!result.ok) {
      return { ok: false, errorCode: result.errorCode, error: result.error };
    }
    return { ok: true, mode: 'device', deviceId: result.deviceId };
  }

  return {
    ok: false,
    errorCode: 'remote_auth_required',
    error: 'Remote mode requires OPENCLI_REMOTE_TOKEN or a device credential registry.',
  };
}

/** Machine-readable error when no extension is connected (remote or local). */
export const ERROR_NO_EXTENSION = {
  errorCode: 'extension_offline',
  error: 'No browser extension connected to the daemon.',
  errorHint:
    'Install the OpenCLI extension, configure remote URL + device credentials (or shared token), and keep Chrome open.',
} as const;

/** Machine-readable error when a second extension is kicked (shared-token unique-active). */
export const ERROR_UNIQUE_CONNECTION = {
  errorCode: 'extension_replaced',
  message:
    'Another extension connection became active; this connection was closed (shared-token unique-active policy).',
} as const;

/** Device credential rejected / missing. */
export const ERROR_DEVICE_AUTH = {
  errorCode: 'device_auth_rejected',
  error: 'Device credentials were rejected for the extension WebSocket.',
  errorHint:
    'Run opencli device list / issue, then set deviceId + deviceToken in the extension side panel.',
} as const;

/** Explicit profile required in device multi-tenant mode. */
export const ERROR_PROFILE_REQUIRED_DEVICE = {
  errorCode: 'profile_required',
  error:
    'Device credential mode requires an explicit browser profile (opencli --profile <deviceId> or OPENCLI_PROFILE).',
  errorHint:
    'Set OPENCLI_PROFILE to the deviceId for this Agent session, or pass --profile <deviceId> on every opencli browser command.',
} as const;
