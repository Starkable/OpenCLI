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
const targetDot = document.getElementById('targetDot');
const targetStatus = document.getElementById('targetStatus');
const targetTitle = document.getElementById('targetTitle');
const targetUrl = document.getElementById('targetUrl');

let bridgeRegistered = false;
let bridgeState = 'disconnected';
let lastBridgeEventSeq = 0;
let sidebarTarget = { status: 'unbound', tabId: null, windowId: null, bindingEpoch: 0, taskId: null };
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
  bridgeState = state;
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

function renderSidebarTarget(target) {
  sidebarTarget = target || sidebarTarget;
  const state = sidebarTarget.status || 'unbound';
  const labels = {
    unbound: '操作目标：未绑定',
    bound: '操作目标：已固定',
    busy: '操作目标：执行中',
    broken: '操作目标：已失效',
  };
  targetDot.className = `dot ${state === 'bound' ? 'ok' : state === 'busy' ? 'warn' : 'bad'}`;
  targetStatus.textContent = labels[state] || labels.unbound;
  targetTitle.textContent = sidebarTarget.title || (state === 'broken'
    ? (sidebarTarget.error || '目标标签不可用，请重新绑定')
    : '请在需要操作的页面绑定当前标签');
  targetUrl.textContent = sidebarTarget.url || '';
  const locked = state === 'busy';
  const bindButton = document.getElementById('btnBind');
  bindButton.textContent = state === 'unbound' ? '绑定当前标签' : '重新绑定当前标签';
  bindButton.disabled = locked;
  document.getElementById('btnUnbind').disabled = locked || state === 'unbound';
  document.getElementById('btnSend').disabled = locked;
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
  document.getElementById('bridgeProject').value = c.bridgeProject || '';
  document.getElementById('preferBindActiveTab').checked = c.preferBindActiveTab !== false;
  applySessionIdentity(c);
  return c;
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
    bridgeProject: document.getElementById('bridgeProject').value.trim(),
    preferBindActiveTab: document.getElementById('preferBindActiveTab').checked,
  };
}

function applyBridgeSnapshot(snapshot) {
  if (!snapshot) return;
  bridgeRegistered = snapshot.registered === true;
  setBridgeStatus(snapshot.state || 'disconnected', snapshot.detail || '');
  for (const event of snapshot.events || []) handleBridgeEvent(event);
  if (Number.isFinite(snapshot.lastSeq)) {
    lastBridgeEventSeq = Math.max(lastBridgeEventSeq, snapshot.lastSeq);
  }
  if (snapshot.target) renderSidebarTarget(snapshot.target);
}

async function connectBridge(config, force = false) {
  applySessionIdentity(config);
  const url = (config.bridgeUrl || '').trim();
  if (!url) {
    bridgeRegistered = false;
    setBridgeStatus('disconnected', '未配置 Bridge URL');
    return;
  }
  setBridgeStatus('connecting');
  try {
    const snapshot = await sendMsg('connectAgentBridge', {
      force,
      afterSeq: lastBridgeEventSeq,
    });
    applyBridgeSnapshot(snapshot);
  } catch (err) {
    setBridgeStatus('error', err instanceof Error ? err.message : String(err));
  }
}

function handleBridgeEvent(event) {
  if (!event || !Number.isFinite(event.seq) || event.seq <= lastBridgeEventSeq) return;
  lastBridgeEventSeq = event.seq;
  handleBridgeMessage(event.message || {});
}

function handleBridgeMessage(msg) {
  switch (msg.type) {
    case 'register_ack':
      if (msg.ok) {
        bridgeRegistered = true;
        setBridgeStatus('connected');
        const proj = (document.getElementById('bridgeProject')?.value || '').trim();
        appendLog(
          `已注册到 cc-connect Bridge（session=${sessionKey}${proj ? `, project=${proj}` : ''}）`,
        );
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
      void sendMsg('sendAgentBridgePayload', {
        payload: {
          type: 'preview_ack',
          ref_id: msg.ref_id,
          preview_handle: `sp-${Date.now()}`,
        },
      });
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
    case 'raw':
      appendLog(`Bridge raw: ${msg.content || ''}`);
      break;
    case 'user_message':
      appendLog(`你: ${msg.content || ''}`);
      break;
    default:
      appendLog(`Bridge ← ${msg.type || 'unknown'}`);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'agentBridgeStatus') {
    bridgeRegistered = msg.state === 'connected';
    setBridgeStatus(msg.state || 'disconnected', msg.detail || '');
  } else if (msg?.type === 'agentBridgeEvent') {
    handleBridgeEvent(msg.event);
  } else if (msg?.type === 'sidebarTargetStatus') {
    const previous = sidebarTarget;
    renderSidebarTarget(msg.target);
    if (sidebarTarget.status === 'broken' && previous.status !== 'broken') {
      appendLog(`目标标签已失效: ${sidebarTarget.error || sidebarTarget.errorCode || 'unknown'}`);
    }
  }
});

async function bindCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !Number.isInteger(tab.windowId)) {
    return { ok: false, error: '无法确定当前标签，请在普通网页上重试。' };
  }
  const result = await sendMsg('bindSidebarTarget', { tabId: tab.id, windowId: tab.windowId });
  if (result?.ok) {
    const target = result?.data?.target;
    if (target) renderSidebarTarget(target);
    appendLog(`已固定当前标签 → session=sidebar, tab=${tab.id}`);
  } else {
    appendLog(`绑定标签失败: ${result?.error || 'unknown'}`);
  }
  return result;
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
  if (bridgeState !== 'connected' || !bridgeRegistered) {
    sendError.textContent = 'Agent Bridge 未就绪：请先在配置中填写 Bridge URL/Token 并保存';
    return;
  }
  const cfgRes = await sendMsg('getRuntimeConfig');
  const config = cfgRes?.config || {};
  applySessionIdentity(config);
  if (!assertRemoteBrowserReady(config)) return;

  if (sidebarTarget.status === 'busy') {
    sendError.textContent = '当前任务仍在操作已绑定标签，请等待完成或先停止任务';
    return;
  }
  if (sidebarTarget.status !== 'bound') {
    const bound = await bindCurrentTab();
    if (!bound?.ok) {
      sendError.textContent = bound?.error || '无法绑定当前标签';
      return;
    }
  }

  // Prefix helps Agent/skills select the device and the non-creating sidebar target policy.
  const deviceHint = config.deviceId?.trim()
    ? `[opencli-device:${config.deviceId.trim()}]\n`
    : '';
  const content = `${deviceHint}[opencli-browser-session:sidebar]\n[opencli-target-policy:bound-only]\n${text}`;

  msgSeq += 1;
  const msgId = `sp-${Date.now()}-${msgSeq}`;
  const replyCtx = msgId;
  const payload = {
    type: 'message',
    msg_id: msgId,
    session_key: sessionKey,
    user_id: sessionUserId,
    chat_id: sessionUserId,
    content,
    reply_ctx: replyCtx,
  };
  const project = (config.bridgeProject || '').trim();
  if (project) payload.project = project;
  const sent = await sendMsg('sendAgentBridgePayload', { payload, displayText: text });
  if (!sent?.ok) {
    sendError.textContent = sent?.error || 'Agent Bridge 发送失败';
    return;
  }
  document.getElementById('input').value = '';
}

async function stopTask() {
  if (bridgeState !== 'connected' || !bridgeRegistered) {
    sendError.textContent = 'Agent Bridge 未连接，无法停止';
    return;
  }
  msgSeq += 1;
  const msgId = `sp-stop-${Date.now()}`;
  const cfgRes = await sendMsg('getRuntimeConfig');
  const config = cfgRes?.config || {};
  const payload = {
    type: 'message',
    msg_id: msgId,
    session_key: sessionKey,
    user_id: sessionUserId,
    chat_id: sessionUserId,
    content: '/stop',
    reply_ctx: msgId,
  };
  const project = (config.bridgeProject || '').trim();
  if (project) payload.project = project;
  const sent = await sendMsg('sendAgentBridgePayload', { payload });
  if (sent?.ok) appendLog('已发送 /stop');
  else sendError.textContent = sent?.error || 'Agent Bridge 发送失败';
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
    if (patch.bridgeUrl && !patch.bridgeProject) {
      cfgError.textContent = '已配置 Bridge URL 时请填写 cc-connect Project 名称（多项目环境必填）';
      return;
    }
    const res = await sendMsg('saveRuntimeConfig', { patch });
    if (!res?.ok) {
      cfgError.textContent = '保存失败';
      return;
    }
    applySessionIdentity(res.config);
    appendLog(`配置已保存；session_key=${sessionKey}；正在重连接线 / Bridge`);
    await refreshDaemonStatus();
    await connectBridge(res.config);
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
document.getElementById('btnStop').addEventListener('click', () => void stopTask());
document.getElementById('btnBind').addEventListener('click', () => void bindCurrentTab());
document.getElementById('btnUnbind').addEventListener('click', async () => {
  const result = await sendMsg('unbindSidebarTarget');
  if (result?.ok) {
    renderSidebarTarget(result?.data?.target);
    appendLog('已解除固定标签');
  } else {
    appendLog(`解除绑定失败: ${result?.error || 'unknown'}`);
  }
});

document.getElementById('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void sendTask();
  }
});

setInterval(() => {
  void refreshDaemonStatus();
}, 3000);

void (async () => {
  const config = await loadConfigIntoForm();
  const sidebarState = await sendMsg('getSidebarState');
  if (sidebarState?.target) renderSidebarTarget(sidebarState.target);
  await refreshDaemonStatus();
  if (config?.bridgeUrl) await connectBridge(config);
  appendLog('侧边栏已就绪。配置服务端设备凭证后即可发送任务。');
})();
