/**
 * OpenCLI Side Panel — Chat UI + config for remote daemon / cc-connect Bridge.
 * Bridge protocol: https://github.com/chenhg5/cc-connect/blob/main/docs/bridge-protocol.md
 */

const PLATFORM = 'opencli-sidebar';
const logEl = document.getElementById('log');
const sendError = document.getElementById('sendError');
const cfgError = document.getElementById('cfgError');
const cfgPanel = document.getElementById('cfgPanel');

const daemonDot = document.getElementById('daemonDot');
const daemonLabel = document.getElementById('daemonLabel');
const bridgeDot = document.getElementById('bridgeDot');
const bridgeLabel = document.getElementById('bridgeLabel');

/** @type {WebSocket | null} */
let bridgeWs = null;
let bridgeRegistered = false;
/** @type {string} */
let sessionUserId = 'local';
/** @type {string} */
let sessionKey = `${PLATFORM}:local:local`;
let msgSeq = 0;
let streamBuffer = '';

function appendLog(line) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function sanitizeSessionSegment(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'local';
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64) || 'local';
}

/** Align Bridge session_key with deviceId (one device per user). */
function applySessionIdentity(config) {
  const deviceId = sanitizeSessionSegment(config?.deviceId);
  sessionUserId = deviceId;
  sessionKey = `${PLATFORM}:${deviceId}:${deviceId}`;
}

function setDaemonStatus(connected, reconnecting, mode, opts = {}) {
  const incomplete = !!opts.configIncomplete;
  const ready = opts.browserChannelReady !== false;
  daemonDot.className = `dot ${
    incomplete ? 'bad' : connected ? 'ok' : reconnecting ? 'warn' : 'bad'
  }`;
  const modeTag = mode === 'remote' ? 'remote' : 'local';
  if (incomplete) {
    daemonLabel.textContent = `浏览器接线：配置不完整（需 deviceId+deviceToken 或 remoteToken）`;
    return;
  }
  if (mode === 'remote' && !ready) {
    daemonLabel.textContent = `浏览器接线：未就绪（${modeTag}）`;
    return;
  }
  daemonLabel.textContent = connected
    ? `浏览器接线：已连接（${modeTag}${opts.deviceId ? ` / ${opts.deviceId}` : ''}）`
    : reconnecting
      ? `浏览器接线：重连中（${modeTag}）`
      : `浏览器接线：未连接（${modeTag}）`;
}

function setBridgeStatus(state, detail = '') {
  const map = { connected: 'ok', connecting: 'warn', disconnected: 'bad', error: 'bad' };
  bridgeDot.className = `dot ${map[state] || 'bad'}`;
  const labels = {
    connected: 'Agent Bridge：已连接',
    connecting: 'Agent Bridge：连接中…',
    disconnected: 'Agent Bridge：未连接',
    error: 'Agent Bridge：错误',
  };
  bridgeLabel.textContent = `${labels[state] || labels.disconnected}${detail ? ` — ${detail}` : ''}`;
}

function sendMsg(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refreshDaemonStatus() {
  try {
    const status = await sendMsg('getStatus');
    setDaemonStatus(!!status?.connected, !!status?.reconnecting, status?.mode || 'local', {
      configIncomplete: !!status?.configIncomplete,
      browserChannelReady: status?.browserChannelReady !== false,
      deviceId: status?.deviceId,
    });
    if (status?.uniqueActiveHint) {
      // Surface policy once per status poll only when disconnected messaging needs it — skip spam.
    }
  } catch {
    setDaemonStatus(false, false, 'local', { configIncomplete: false, browserChannelReady: true });
  }
}

async function loadConfigIntoForm() {
  const res = await sendMsg('getRuntimeConfig');
  const c = res?.config || {};
  document.getElementById('mode').value = c.mode || 'local';
  document.getElementById('daemonBaseUrl').value = c.daemonBaseUrl || '';
  document.getElementById('deviceId').value = c.deviceId || '';
  document.getElementById('deviceToken').value = c.deviceToken || '';
  document.getElementById('remoteToken').value = c.remoteToken || '';
  document.getElementById('bridgeUrl').value = c.bridgeUrl || '';
  document.getElementById('bridgeToken').value = c.bridgeToken || '';
  document.getElementById('preferBindActiveTab').checked = c.preferBindActiveTab !== false;
  applySessionIdentity(c);
}

function readFormConfig() {
  return {
    mode: document.getElementById('mode').value,
    daemonBaseUrl: document.getElementById('daemonBaseUrl').value.trim(),
    deviceId: document.getElementById('deviceId').value.trim(),
    deviceToken: document.getElementById('deviceToken').value,
    remoteToken: document.getElementById('remoteToken').value,
    bridgeUrl: document.getElementById('bridgeUrl').value.trim(),
    bridgeToken: document.getElementById('bridgeToken').value,
    preferBindActiveTab: document.getElementById('preferBindActiveTab').checked,
  };
}

function bridgeWsUrl(base, token) {
  const u = new URL(base);
  if (token) u.searchParams.set('token', token);
  return u.toString();
}

function disconnectBridge() {
  bridgeRegistered = false;
  if (bridgeWs) {
    try {
      bridgeWs.close();
    } catch {
      // ignore
    }
  }
  bridgeWs = null;
  setBridgeStatus('disconnected');
}

function connectBridge(config) {
  disconnectBridge();
  applySessionIdentity(config);
  const url = (config.bridgeUrl || '').trim();
  if (!url) {
    setBridgeStatus('disconnected', '未配置 Bridge URL');
    return;
  }
  setBridgeStatus('connecting');
  let ws;
  try {
    ws = new WebSocket(bridgeWsUrl(url, config.bridgeToken || ''));
  } catch (err) {
    setBridgeStatus('error', err instanceof Error ? err.message : String(err));
    return;
  }
  bridgeWs = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'register',
      platform: PLATFORM,
      capabilities: ['text', 'preview', 'typing'],
      metadata: {
        version: chrome.runtime.getManifest().version,
        protocol_version: 1,
        description: 'OpenCLI browser side panel',
        device_id: config.deviceId || undefined,
      },
    }));
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      appendLog(`Bridge raw: ${String(ev.data).slice(0, 200)}`);
      return;
    }
    handleBridgeMessage(msg, ws);
  };

  ws.onclose = () => {
    if (bridgeWs === ws) {
      bridgeWs = null;
      bridgeRegistered = false;
      setBridgeStatus('disconnected');
    }
  };

  ws.onerror = () => {
    setBridgeStatus('error', 'WebSocket error');
  };
}

function handleBridgeMessage(msg, ws) {
  switch (msg.type) {
    case 'register_ack':
      if (msg.ok) {
        bridgeRegistered = true;
        setBridgeStatus('connected');
        appendLog(`已注册到 cc-connect Bridge（session=${sessionKey}）`);
      } else {
        bridgeRegistered = false;
        setBridgeStatus('error', msg.error || 'register rejected');
        appendLog(`Bridge 注册失败: ${msg.error || 'unknown'}`);
      }
      break;
    case 'reply':
      appendLog(`Agent: ${msg.content || ''}`);
      streamBuffer = '';
      break;
    case 'reply_stream':
      streamBuffer = msg.full_text || (streamBuffer + (msg.delta || ''));
      if (msg.done) {
        appendLog(`Agent: ${streamBuffer}`);
        streamBuffer = '';
      }
      break;
    case 'preview_start':
      ws.send(JSON.stringify({
        type: 'preview_ack',
        ref_id: msg.ref_id,
        preview_handle: `sp-${Date.now()}`,
      }));
      appendLog(msg.content || '…');
      break;
    case 'update_message':
      appendLog(`Agent*: ${msg.content || ''}`);
      break;
    case 'typing_start':
      appendLog('Agent 正在输入…');
      break;
    case 'typing_stop':
      break;
    case 'pong':
      break;
    default:
      appendLog(`Bridge ← ${msg.type || 'unknown'}`);
  }
}

async function maybeBindActiveTab(config) {
  if (!config.preferBindActiveTab) return;
  const result = await sendMsg('bindActiveTab', { session: 'sidebar' });
  if (result?.ok) {
    appendLog(`已绑定当前 tab → session=sidebar`);
  } else {
    appendLog(`绑定 tab 失败: ${result?.error || 'unknown'}（仍可发送任务）`);
  }
}

function assertRemoteBrowserReady(config) {
  if (config.mode !== 'remote') return true;
  const hasDevice = Boolean(config.deviceId?.trim() && config.deviceToken?.trim());
  const hasShared = Boolean(config.remoteToken?.trim());
  if (!hasDevice && !hasShared) {
    sendError.textContent = '浏览器接线未就绪：请配置 deviceId + deviceToken（推荐）或 Remote Token';
    return false;
  }
  if (!hasDevice && hasShared) {
    appendLog('提示：当前使用共享 Remote Token（单租户互踢）。多人并行请改用设备凭证。');
  }
  return true;
}

async function sendTask() {
  sendError.textContent = '';
  const text = document.getElementById('input').value.trim();
  if (!text) return;
  if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN || !bridgeRegistered) {
    sendError.textContent = 'Agent Bridge 未就绪：请先在配置中填写 Bridge URL/Token 并保存';
    return;
  }
  const cfgRes = await sendMsg('getRuntimeConfig');
  const config = cfgRes?.config || {};
  applySessionIdentity(config);
  if (!assertRemoteBrowserReady(config)) return;

  await maybeBindActiveTab(config);

  // Prefix helps Agent/skills pick OPENCLI_PROFILE when env injection is unavailable.
  const deviceHint = config.deviceId?.trim()
    ? `[opencli-device:${config.deviceId.trim()}]\n`
    : '';
  const content = `${deviceHint}${text}`;

  msgSeq += 1;
  const msgId = `sp-${Date.now()}-${msgSeq}`;
  const replyCtx = msgId;
  bridgeWs.send(JSON.stringify({
    type: 'message',
    msg_id: msgId,
    session_key: sessionKey,
    user_id: sessionUserId,
    chat_id: sessionUserId,
    content,
    reply_ctx: replyCtx,
  }));
  appendLog(`你: ${text}`);
  document.getElementById('input').value = '';
}

function stopTask() {
  if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN || !bridgeRegistered) {
    sendError.textContent = 'Agent Bridge 未连接，无法停止';
    return;
  }
  msgSeq += 1;
  const msgId = `sp-stop-${Date.now()}`;
  bridgeWs.send(JSON.stringify({
    type: 'message',
    msg_id: msgId,
    session_key: sessionKey,
    user_id: sessionUserId,
    chat_id: sessionUserId,
    content: '/stop',
    reply_ctx: msgId,
  }));
  appendLog('已发送 /stop');
}

document.getElementById('btnToggleCfg').addEventListener('click', () => {
  cfgPanel.classList.toggle('open');
});

document.getElementById('btnSaveCfg').addEventListener('click', async () => {
  cfgError.textContent = '';
  try {
    const patch = readFormConfig();
    if (patch.mode === 'remote' && !patch.daemonBaseUrl) {
      cfgError.textContent = 'remote 模式需要 Daemon Base URL';
      return;
    }
    if (patch.mode === 'remote') {
      const hasDevice = Boolean(patch.deviceId && patch.deviceToken);
      const hasShared = Boolean(patch.remoteToken);
      if (!hasDevice && !hasShared) {
        cfgError.textContent = 'remote 模式需要 deviceId+deviceToken（推荐）或 Remote Token';
        return;
      }
      if (hasDevice && !patch.deviceId) {
        cfgError.textContent = '填写了 deviceToken 时必须同时填写 deviceId';
        return;
      }
    }
    const res = await sendMsg('saveRuntimeConfig', { patch });
    if (!res?.ok) {
      cfgError.textContent = '保存失败';
      return;
    }
    applySessionIdentity(res.config);
    appendLog(`配置已保存；session_key=${sessionKey}；正在重连接线 / Bridge`);
    await refreshDaemonStatus();
    connectBridge(res.config);
  } catch (err) {
    cfgError.textContent = err instanceof Error ? err.message : String(err);
  }
});

document.getElementById('btnReconnect').addEventListener('click', async () => {
  await sendMsg('reconnectDaemon');
  await refreshDaemonStatus();
  appendLog('已请求重连 daemon');
});

document.getElementById('btnSend').addEventListener('click', () => {
  void sendTask();
});
document.getElementById('btnStop').addEventListener('click', () => stopTask());
document.getElementById('btnBind').addEventListener('click', async () => {
  const result = await sendMsg('bindActiveTab', { session: 'sidebar' });
  appendLog(result?.ok ? '绑定当前 tab 成功' : `绑定失败: ${result?.error || 'unknown'}`);
});

document.getElementById('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void sendTask();
  }
});

setInterval(() => {
  if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN && bridgeRegistered) {
    try {
      bridgeWs.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    } catch {
      // ignore
    }
  }
}, 30000);

setInterval(() => {
  void refreshDaemonStatus();
}, 3000);

void (async () => {
  await loadConfigIntoForm();
  await refreshDaemonStatus();
  const res = await sendMsg('getRuntimeConfig');
  if (res?.config?.bridgeUrl) connectBridge(res.config);
  appendLog('侧边栏已就绪。配置服务端设备凭证后即可发送任务。');
})();
