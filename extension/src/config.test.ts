import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BRIDGE_PLATFORM,
  DEFAULT_RUNTIME_CONFIG,
  buildBridgeSessionKey,
  resolveBridgePlatform,
  sanitizeBridgeSessionSegment,
  type ExtensionRuntimeConfig,
} from './config';

function cfg(patch: Partial<ExtensionRuntimeConfig>): ExtensionRuntimeConfig {
  return { ...DEFAULT_RUNTIME_CONFIG, ...patch };
}

describe('resolveBridgePlatform', () => {
  it('uses bridgeProject when set', () => {
    expect(resolveBridgePlatform(cfg({ bridgeProject: 'opencli-sidebar-testA' }))).toBe(
      'opencli-sidebar-testA',
    );
  });

  it('trims whitespace around bridgeProject', () => {
    expect(resolveBridgePlatform(cfg({ bridgeProject: '  opencli-sidebar-alice  ' }))).toBe(
      'opencli-sidebar-alice',
    );
  });

  it('falls back to DEFAULT_BRIDGE_PLATFORM when bridgeProject is empty', () => {
    expect(resolveBridgePlatform(cfg({ bridgeProject: '' }))).toBe(DEFAULT_BRIDGE_PLATFORM);
    expect(resolveBridgePlatform(cfg({ bridgeProject: '   ' }))).toBe(DEFAULT_BRIDGE_PLATFORM);
    expect(DEFAULT_BRIDGE_PLATFORM).toBe('opencli-sidebar');
  });

  it('keeps distinct platforms for different projects (multi-user adapter slots)', () => {
    const a = resolveBridgePlatform(cfg({ bridgeProject: 'opencli-sidebar-a' }));
    const b = resolveBridgePlatform(cfg({ bridgeProject: 'opencli-sidebar-b' }));
    expect(a).not.toBe(b);
    expect(a).toBe('opencli-sidebar-a');
    expect(b).toBe('opencli-sidebar-b');
  });
});

describe('buildBridgeSessionKey', () => {
  it('prefixes session_key with resolved platform and deviceId', () => {
    expect(
      buildBridgeSessionKey(
        cfg({ bridgeProject: 'opencli-sidebar-testA', deviceId: 'testA' }),
      ),
    ).toBe('opencli-sidebar-testA:testA:testA');
  });

  it('uses opencli-sidebar prefix when project is empty (compat path)', () => {
    expect(buildBridgeSessionKey(cfg({ bridgeProject: '', deviceId: 'alice' }))).toBe(
      'opencli-sidebar:alice:alice',
    );
  });

  it('uses local segments when deviceId is missing', () => {
    expect(buildBridgeSessionKey(cfg({ bridgeProject: 'opencli-sidebar', deviceId: '' }))).toBe(
      'opencli-sidebar:local:local',
    );
  });
});

describe('sanitizeBridgeSessionSegment', () => {
  it('replaces unsafe characters and caps length', () => {
    expect(sanitizeBridgeSessionSegment('a b/c')).toBe('a_b_c');
    expect(sanitizeBridgeSessionSegment('')).toBe('local');
  });
});
