/**
 * Unit tests for device registry + remote-mode auth helpers.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  authenticateDevice,
  hashDeviceToken,
  issueDevice,
  listDevices,
  loadDeviceRegistry,
  revokeDevice,
  ENV_DEVICE_REGISTRY,
  isDeviceCredentialMode,
} from './device-registry.js';
import {
  authenticateExtensionWs,
  describeRemoteAuthMode,
  extractDeviceId,
  extractDeviceToken,
  extractRemoteToken,
  getDaemonBindHost,
  isDeviceRemoteMode,
  isLoopbackAddress,
  isRemoteMode,
  isUniqueActiveRemoteMode,
  remoteTokensMatch,
  ENV_REMOTE_TOKEN,
  ENV_DAEMON_BIND,
  ERROR_PROFILE_REQUIRED_DEVICE,
} from './remote-mode.js';
import { resolveProfileRoute } from './daemon-utils.js';
import type { IncomingMessage } from 'node:http';

function fakeReq(url: string, headers: Record<string, string | undefined> = {}): IncomingMessage {
  return { url, headers } as IncomingMessage;
}

describe('device-registry', () => {
  let dir: string;
  let registryPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-devices-'));
    registryPath = path.join(dir, 'devices.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('issues a device and stores only the token hash', () => {
    const issued = issueDevice({ deviceId: 'devalpha', registryPath, note: 'lab' });
    expect(issued.deviceId).toBe('devalpha');
    expect(issued.deviceToken.length).toBeGreaterThan(20);
    const registry = loadDeviceRegistry(registryPath);
    expect(registry.devices.devalpha.status).toBe('active');
    expect(registry.devices.devalpha.tokenHash).toBe(hashDeviceToken(issued.deviceToken));
    expect(JSON.stringify(registry)).not.toContain(issued.deviceToken);
  });

  it('authenticates active devices and rejects bad tokens', () => {
    const issued = issueDevice({ deviceId: 'dev1', registryPath });
    expect(authenticateDevice('dev1', issued.deviceToken, registryPath)).toEqual({
      ok: true,
      deviceId: 'dev1',
    });
    expect(authenticateDevice('dev1', 'wrong-token', registryPath)).toMatchObject({
      ok: false,
      errorCode: 'device_token_invalid',
    });
    expect(authenticateDevice(undefined, undefined, registryPath)).toMatchObject({
      ok: false,
      errorCode: 'device_credentials_required',
    });
  });

  it('rejects revoked devices', () => {
    const issued = issueDevice({ deviceId: 'gone', registryPath });
    revokeDevice('gone', { registryPath });
    expect(authenticateDevice('gone', issued.deviceToken, registryPath)).toMatchObject({
      ok: false,
      errorCode: 'device_revoked',
    });
    expect(listDevices(registryPath)[0]?.status).toBe('revoked');
  });
});

describe('remote-mode', () => {
  const prevToken = process.env[ENV_REMOTE_TOKEN];
  const prevBind = process.env[ENV_DAEMON_BIND];
  const prevRegistry = process.env[ENV_DEVICE_REGISTRY];
  let dir: string;

  beforeEach(() => {
    delete process.env[ENV_REMOTE_TOKEN];
    delete process.env[ENV_DAEMON_BIND];
    delete process.env[ENV_DEVICE_REGISTRY];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-remote-'));
  });

  afterEach(() => {
    if (prevToken === undefined) delete process.env[ENV_REMOTE_TOKEN];
    else process.env[ENV_REMOTE_TOKEN] = prevToken;
    if (prevBind === undefined) delete process.env[ENV_DAEMON_BIND];
    else process.env[ENV_DAEMON_BIND] = prevBind;
    if (prevRegistry === undefined) delete process.env[ENV_DEVICE_REGISTRY];
    else process.env[ENV_DEVICE_REGISTRY] = prevRegistry;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('isRemoteMode when token set', () => {
    expect(isRemoteMode()).toBe(false);
    process.env[ENV_REMOTE_TOKEN] = 'secret';
    expect(isRemoteMode()).toBe(true);
    expect(describeRemoteAuthMode()).toBe('shared-token');
    expect(isUniqueActiveRemoteMode()).toBe(true);
  });

  it('enters device mode when OPENCLI_DEVICE_REGISTRY is set', () => {
    const registryPath = path.join(dir, 'devices.json');
    process.env[ENV_DEVICE_REGISTRY] = registryPath;
    expect(isDeviceCredentialMode()).toBe(true);
    expect(isDeviceRemoteMode()).toBe(true);
    expect(isRemoteMode()).toBe(true);
    expect(isUniqueActiveRemoteMode()).toBe(false);
    expect(describeRemoteAuthMode()).toBe('device-credentials');
  });

  it('binds loopback by default and 0.0.0.0 in remote mode', () => {
    expect(getDaemonBindHost()).toBe('127.0.0.1');
    process.env[ENV_REMOTE_TOKEN] = 'secret';
    expect(getDaemonBindHost()).toBe('0.0.0.0');
    process.env[ENV_DAEMON_BIND] = '10.0.0.5';
    expect(getDaemonBindHost()).toBe('10.0.0.5');
  });

  it('detects loopback addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
  });

  it('extracts token and device credentials from query and headers', () => {
    expect(extractRemoteToken(fakeReq('/ext?token=abc'))).toBe('abc');
    expect(extractRemoteToken(fakeReq('/ext', { 'x-opencli-remote-token': 'hdr' }))).toBe('hdr');
    expect(extractRemoteToken(fakeReq('/ext', { authorization: 'Bearer tok' }))).toBe('tok');
    expect(extractDeviceId(fakeReq('/ext?deviceId=d1&deviceToken=t1'))).toBe('d1');
    expect(extractDeviceToken(fakeReq('/ext?deviceId=d1&deviceToken=t1'))).toBe('t1');
    expect(extractDeviceId(fakeReq('/ext', { 'x-opencli-device-id': 'hdr-d' }))).toBe('hdr-d');
  });

  it('matches tokens with timing-safe compare', () => {
    expect(remoteTokensMatch('secret', 'secret')).toBe(true);
    expect(remoteTokensMatch('secret', 'wrong')).toBe(false);
    expect(remoteTokensMatch('secret', undefined)).toBe(false);
  });

  it('authenticateExtensionWs accepts device credentials and rejects revoked', () => {
    const registryPath = path.join(dir, 'devices.json');
    process.env[ENV_DEVICE_REGISTRY] = registryPath;
    const issued = issueDevice({ deviceId: 'alice', registryPath });

    const ok = authenticateExtensionWs(
      fakeReq(`/ext?deviceId=alice&deviceToken=${encodeURIComponent(issued.deviceToken)}`),
      {
        deviceMode: true,
        authenticateDevice: (id, token) => authenticateDevice(id, token, registryPath),
      },
    );
    expect(ok).toEqual({ ok: true, mode: 'device', deviceId: 'alice' });

    revokeDevice('alice', { registryPath });
    const bad = authenticateExtensionWs(
      fakeReq(`/ext?deviceId=alice&deviceToken=${encodeURIComponent(issued.deviceToken)}`),
      {
        deviceMode: true,
        authenticateDevice: (id, token) => authenticateDevice(id, token, registryPath),
      },
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errorCode).toBe('device_revoked');
  });

  it('exposes profile_required contract for device mode', () => {
    expect(ERROR_PROFILE_REQUIRED_DEVICE.errorCode).toBe('profile_required');
  });
});

describe('resolveProfileRoute device mode', () => {
  it('requires explicit target even when a single profile is connected', () => {
    expect(resolveProfileRoute({
      connectedContextIds: ['only'],
      requireExplicitTarget: true,
    })).toMatchObject({ ok: false, errorCode: 'profile_required' });

    expect(resolveProfileRoute({
      preferredContextId: 'only',
      connectedContextIds: ['only'],
      requireExplicitTarget: true,
    })).toMatchObject({ ok: false, errorCode: 'profile_required' });

    expect(resolveProfileRoute({
      requestedContextId: 'only',
      connectedContextIds: ['only'],
      requireExplicitTarget: true,
    })).toEqual({ ok: true, contextId: 'only' });
  });

  it('keeps multi-device routing strict for offline targets', () => {
    expect(resolveProfileRoute({
      requestedContextId: 'a',
      connectedContextIds: ['b', 'c'],
      requireExplicitTarget: true,
    })).toMatchObject({ ok: false, errorCode: 'profile_disconnected' });
  });

  it('still allows single-connection fallback when requireExplicitTarget is off', () => {
    expect(resolveProfileRoute({ connectedContextIds: ['only'] })).toEqual({
      ok: true,
      contextId: 'only',
    });
  });
});
