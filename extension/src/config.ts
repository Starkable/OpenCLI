/**
 * Extension runtime config (chrome.storage.local).
 * Local mode: connect to localhost:19825 (classic).
 * Remote mode: outbound connect to server daemon with shared token and/or device credentials.
 */

export type ExtensionConnectMode = 'local' | 'remote';

export interface ExtensionRuntimeConfig {
  mode: ExtensionConnectMode;
  /** Base HTTP URL of daemon, e.g. http://10.0.0.5:19825 */
  daemonBaseUrl: string;
  /**
   * Shared secret for remote WS (OPENCLI_REMOTE_TOKEN on server).
   * Used for legacy shared-token remote mode; prefer deviceId + deviceToken for multi-tenant.
   */
  remoteToken: string;
  /** Multi-tenant device id (must match server registry / hello.contextId) */
  deviceId: string;
  /** Multi-tenant device token (plaintext; server stores hash only) */
  deviceToken: string;
  /** cc-connect Bridge WS URL, e.g. ws://10.0.0.5:9810/bridge/ws */
  bridgeUrl: string;
  /** cc-connect Bridge token */
  bridgeToken: string;
  /** When sending a side-panel task, prefer binding the active tab first */
  preferBindActiveTab: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: ExtensionRuntimeConfig = {
  mode: 'local',
  daemonBaseUrl: 'http://localhost:19825',
  remoteToken: '',
  deviceId: '',
  deviceToken: '',
  bridgeUrl: '',
  bridgeToken: '',
  preferBindActiveTab: true,
};

export const STORAGE_KEY = 'opencliRuntimeConfig';

export async function loadRuntimeConfig(): Promise<ExtensionRuntimeConfig> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY] as Partial<ExtensionRuntimeConfig> | undefined;
  return { ...DEFAULT_RUNTIME_CONFIG, ...raw };
}

export async function saveRuntimeConfig(
  patch: Partial<ExtensionRuntimeConfig>,
): Promise<ExtensionRuntimeConfig> {
  const current = await loadRuntimeConfig();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/** True when remote multi-tenant device credentials are fully configured. */
export function hasDeviceCredentials(config: ExtensionRuntimeConfig): boolean {
  return Boolean(config.deviceId.trim() && config.deviceToken.trim());
}

/** Build WS + ping URLs from runtime config. */
export function resolveDaemonEndpoints(config: ExtensionRuntimeConfig): {
  wsUrl: string;
  pingUrl: string;
} {
  if (config.mode !== 'remote' || !config.daemonBaseUrl.trim()) {
    return {
      wsUrl: 'ws://localhost:19825/ext',
      pingUrl: 'http://localhost:19825/ping',
    };
  }
  const base = config.daemonBaseUrl.trim().replace(/\/$/, '');
  let wsBase: string;
  if (base.startsWith('https://')) wsBase = `wss://${base.slice('https://'.length)}`;
  else if (base.startsWith('http://')) wsBase = `ws://${base.slice('http://'.length)}`;
  else if (base.startsWith('ws://') || base.startsWith('wss://')) wsBase = base;
  else wsBase = `ws://${base}`;

  const httpBase =
    base.startsWith('http://') || base.startsWith('https://')
      ? base
      : base.startsWith('wss://')
        ? `https://${base.slice('wss://'.length)}`
        : base.startsWith('ws://')
          ? `http://${base.slice('ws://'.length)}`
          : `http://${base}`;

  const params = new URLSearchParams();
  if (hasDeviceCredentials(config)) {
    params.set('deviceId', config.deviceId.trim());
    params.set('deviceToken', config.deviceToken.trim());
  } else if (config.remoteToken.trim()) {
    params.set('token', config.remoteToken.trim());
  }
  const qs = params.toString();
  const wsUrl = qs ? `${wsBase}/ext?${qs}` : `${wsBase}/ext`;
  return {
    wsUrl,
    pingUrl: `${httpBase}/ping`,
  };
}
