/**
 * opencli browser protocol — shared types between daemon, extension, and CLI.
 *
 * Remote mode: extension connects outbound to a server daemon with
 * OPENCLI_REMOTE_TOKEN; see extension/src/config.ts and docs/guide/sidebar-remote-opencli.md.
 */

export type Action =
  | 'exec'
  | 'navigate'
  | 'tabs'
  | 'cookies'
  | 'screenshot'
  | 'close-window'
  | 'sessions'
  | 'set-file-input'
  | 'insert-text'
  | 'bind'
  | 'network-capture-start'
  | 'network-capture-read'
  | 'wait-download'
  | 'cdp'
  | 'frames';

export interface Command {
  id: string;
  action: Action;
  page?: string;
  code?: string;
  session?: string;
  surface?: 'browser' | 'adapter';
  siteSession?: 'ephemeral' | 'persistent';
  url?: string;
  op?: 'list' | 'new' | 'close' | 'select';
  index?: number;
  domain?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
  width?: number;
  height?: number;
  files?: string[];
  selector?: string;
  text?: string;
  pattern?: string;
  timeoutMs?: number;
  cdpMethod?: string;
  cdpParams?: Record<string, unknown>;
  windowMode?: 'foreground' | 'background';
  idleTimeout?: number;
  frameIndex?: number;
  contextId?: string;
  preferredContextId?: string;
  timeout?: number;
  deadlineAt?: number;
}

export interface Result {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  errorHint?: string;
  page?: string;
}

/** Default daemon port (local mode) */
export const DAEMON_PORT = 19825;
export const DAEMON_HOST = 'localhost';
/** @deprecated Prefer resolveDaemonEndpoints from config.ts for remote mode */
export const DAEMON_WS_URL = `ws://${DAEMON_HOST}:${DAEMON_PORT}/ext`;
/** @deprecated Prefer resolveDaemonEndpoints from config.ts for remote mode */
export const DAEMON_PING_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}/ping`;

export const WS_RECONNECT_BASE_DELAY = 2000;
export const WS_RECONNECT_MAX_DELAY = 5000;
