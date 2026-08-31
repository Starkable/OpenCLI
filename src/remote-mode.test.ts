/**
 * Unit tests for remote-mode helpers.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  extractRemoteToken,
  getDaemonBindHost,
  isLoopbackAddress,
  isRemoteMode,
  remoteTokensMatch,
  ENV_REMOTE_TOKEN,
  ENV_DAEMON_BIND,
} from './remote-mode.js';
import type { IncomingMessage } from 'node:http';

function fakeReq(url: string, headers: Record<string, string | undefined> = {}): IncomingMessage {
  return { url, headers } as IncomingMessage;
}

describe('remote-mode', () => {
  const prevToken = process.env[ENV_REMOTE_TOKEN];
  const prevBind = process.env[ENV_DAEMON_BIND];

  beforeEach(() => {
    delete process.env[ENV_REMOTE_TOKEN];
    delete process.env[ENV_DAEMON_BIND];
  });

  afterEach(() => {
    if (prevToken === undefined) delete process.env[ENV_REMOTE_TOKEN];
    else process.env[ENV_REMOTE_TOKEN] = prevToken;
    if (prevBind === undefined) delete process.env[ENV_DAEMON_BIND];
    else process.env[ENV_DAEMON_BIND] = prevBind;
  });

  it('isRemoteMode when token set', () => {
    expect(isRemoteMode()).toBe(false);
    process.env[ENV_REMOTE_TOKEN] = 'secret';
    expect(isRemoteMode()).toBe(true);
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

  it('extracts token from query and headers', () => {
    expect(extractRemoteToken(fakeReq('/ext?token=abc'))).toBe('abc');
    expect(extractRemoteToken(fakeReq('/ext', { 'x-opencli-remote-token': 'hdr' }))).toBe('hdr');
    expect(extractRemoteToken(fakeReq('/ext', { authorization: 'Bearer tok' }))).toBe('tok');
  });

  it('matches tokens with timing-safe compare', () => {
    expect(remoteTokensMatch('secret', 'secret')).toBe(true);
    expect(remoteTokensMatch('secret', 'wrong')).toBe(false);
    expect(remoteTokensMatch('secret', undefined)).toBe(false);
  });
});
