# OpenCLI 设备凭证模式：完整部署、配置与运维手册

本文面向以下部署结构：

```text
用户电脑 Chrome
├─ OpenCLI 扩展 Background ── deviceId/deviceToken ──► OpenCLI daemon :19825
└─ OpenCLI Side Panel ──────── Bridge Token ─────────► cc-connect Bridge :9810
                                                              │
                                                              ▼
                                                     cc-connect Agent
                                                     OPENCLI_PROFILE=<deviceId>
                                                              │
                                                              ▼
                                                     本机 OpenCLI CLI
                                                              │
                                                              ▼
                                                     对应用户的浏览器扩展
```

推荐场景是“服务端/虚机运行 OpenCLI 和 cc-connect，用户电脑只安装浏览器扩展”。用户电脑上已有的本地 OpenCLI 不需要安装、升级或卸载，也不会参与远程链路。

## 1. 四个容易混淆的配置

| 配置 | 所在位置 | 作用 |
|---|---|---|
| `deviceId + deviceToken` | 浏览器扩展和 daemon 设备登记表 | 扩展连接 daemon 时的设备身份认证 |
| Bridge Token | 浏览器扩展和 cc-connect `[bridge]` | Side Panel 连接 Agent Bridge 的认证 |
| `OPENCLI_PROFILE=<deviceId>` | cc-connect Agent 环境 | 将 CLI 命令路由到指定浏览器设备 |
| `OPENCLI_BROWSER_SESSION=sidebar` | cc-connect Agent 环境 | 使用扩展中名为 `sidebar` 的固定浏览器会话 |
| `OPENCLI_TARGET_POLICY=bound-only` | cc-connect Agent 环境 | 只操作侧栏已绑定标签，禁止静默新建标签或窗口 |

`deviceToken` 与 Bridge Token 是两套独立凭证，不能互换。扩展鉴权成功也不等于 Agent 已经选对浏览器；后者必须依赖 `OPENCLI_PROFILE`。

## 2. 版本与部署边界

本文对应的源码版本：

- OpenCLI CLI/daemon：`1.8.8`
- 浏览器扩展：`1.0.25`
- Node.js：`>=20.18.1`，当前虚机建议统一使用 Node.js 22

约定：

- “虚机命令”只在运行 daemon 和 cc-connect 的服务器执行。
- “本地操作”只指用户电脑上的 Chrome 扩展操作。
- 不要在用户电脑执行 `npm install -g`、`npm link` 或 `opencli daemon restart`。

## 3. 虚机部署 OpenCLI

### 3.1 确认当前使用的二进制

虚机执行：

```bash
source /root/.nvm/nvm.sh
nvm use 22
hash -r

command -v node
node --version
command -v npm
npm prefix -g
command -v opencli
opencli --version
```

推荐结果类似：

```text
/root/.nvm/versions/node/v22.23.0/bin/opencli
v22.23.0
/root/.nvm/versions/node/v22.23.0
1.8.8
```

如果 `type -a opencli` 显示多个版本，后续安装、启动、状态检查必须使用同一套 Node/npm/OpenCLI。不要用 Node 20 的 npm 安装，却用 Node 22 的 opencli 启动，反之亦然。

### 3.2 从源码部署（仅虚机需要时执行）

```bash
cd /home/workspace/opencli

source /root/.nvm/nvm.sh
nvm use 22

npm ci
npm run build
npm link
hash -r

command -v opencli
opencli --version
opencli device --help
```

如果不希望全局 link，也可以继续使用已经部署好的、版本正确的绝对路径。关键是 daemon 与 Agent 调用的是同一个 OpenCLI 版本。

检查当前运行 daemon 的真实来源：

```bash
opencli daemon status

DAEMON_PID="$(pgrep -f 'opencli.*daemon.js' | head -n 1)"
test -n "$DAEMON_PID" && tr '\0' ' ' < "/proc/$DAEMON_PID/cmdline"
```

## 4. 启用 device-credentials 模式

### 4.1 创建设备登记目录

虚机执行：

```bash
mkdir -p /var/lib/opencli
chmod 700 /var/lib/opencli

export OPENCLI_DEVICE_REGISTRY=/var/lib/opencli/devices.json
export OPENCLI_DAEMON_BIND=0.0.0.0
unset OPENCLI_REMOTE_TOKEN
```

模式判定规则：

| 模式 | 条件 | 行为 |
|---|---|---|
| Local | 没有设备登记，也没有共享 Remote Token | daemon 默认只监听 `127.0.0.1` |
| Shared Token | 仅设置 `OPENCLI_REMOTE_TOKEN` | 单租户；新扩展会顶替旧扩展 |
| Device Credentials | 设置 `OPENCLI_DEVICE_REGISTRY`，或默认登记文件存在 | 多设备并行；命令强制显式 profile |

生产环境建议取消 `OPENCLI_REMOTE_TOKEN`。如果登记表与共享 Token 同时存在，系统仍显示设备凭证模式，但未携带 `deviceId` 的旧客户端可能通过共享 Token 回退认证。这只适合迁移期，不建议长期保留。

### 4.2 签发设备凭证

为每台浏览器签发独立凭证：

```bash
opencli device issue sxh-browser \
  --note "shenxianghong browser" \
  --registry /var/lib/opencli/devices.json
```

输出类似：

```text
Issued device credentials
  deviceId:     sxh-browser
  deviceToken:  <只显示一次的明文 Token>
  registry:     /var/lib/opencli/devices.json
```

立即通过安全渠道保存并分发 `deviceId` 和 `deviceToken`。服务端登记表只保存 Token 的 SHA-256 哈希，明文 Token 无法从登记表恢复。

设备 ID 仅使用字母、数字、下划线和连字符，例如：

```text
sxh-browser
alice_chrome
desk-001
```

查看设备列表：

```bash
opencli device list \
  --registry /var/lib/opencli/devices.json

chmod 600 /var/lib/opencli/devices.json
```

### 4.3 启动 daemon

必须在带有上述环境变量的同一个 Shell 中启动：

```bash
opencli daemon stop
opencli daemon start
opencli daemon status
```

预期关键状态：

```text
Auth mode: device-credentials
Unique active: false
Require explicit profile: true
Port: 19825
```

接口检查：

```bash
curl -s http://127.0.0.1:19825/ping
curl -s http://127.0.0.1:19825/status
```

部分版本的 `/ping` 只返回 `{"ok":true}`，认证模式以 `opencli daemon status` 或 `/status` 为准。

检查监听地址：

```bash
ss -tlnp | grep 19825
```

远程浏览器必须能访问：

```text
http://<虚机地址>:19825
```

不要将 19825 端口无保护地暴露到公网；至少使用内网 ACL、防火墙白名单或受控反向代理。

## 5. 持久化 daemon 环境变量

交互式 `export` 只对当前 Shell 及其子进程有效。机器重启、从其他终端重启 daemon，或由 systemd/守护进程重新拉起后，变量可能丢失。

必须把下面两项写入“真正启动 OpenCLI daemon 的服务配置或启动脚本”：

```text
OPENCLI_DEVICE_REGISTRY=/var/lib/opencli/devices.json
OPENCLI_DAEMON_BIND=0.0.0.0
```

如果现有 systemd unit 支持 `EnvironmentFile`，可以创建仅 root 可读的环境文件：

```bash
mkdir -p /etc/opencli

# 使用运维编辑器创建 /etc/opencli/opencli.env，内容如下：
# OPENCLI_DEVICE_REGISTRY=/var/lib/opencli/devices.json
# OPENCLI_DAEMON_BIND=0.0.0.0

chmod 600 /etc/opencli/opencli.env
```

然后让现有服务引用：

```ini
[Service]
EnvironmentFile=/etc/opencli/opencli.env
```

服务名称和启动方式因环境而异，不要在没有现有 unit 的情况下直接照搬一个未知服务名。完成后重启实际服务，并检查运行进程继承的变量名：

```bash
DAEMON_PID="$(pgrep -f 'opencli.*daemon.js' | head -n 1)"

tr '\0' '\n' < "/proc/$DAEMON_PID/environ" \
  | grep '^OPENCLI_' \
  | cut -d= -f1
```

应至少看到：

```text
OPENCLI_DEVICE_REGISTRY
OPENCLI_DAEMON_BIND
```

不要直接打印完整环境变量，避免 Token 泄露到终端历史或排障记录。

## 6. 配置 cc-connect

### 6.1 推荐：每个设备一个 project

当前 cc-connect 的 `work_dir` 和 provider `env` 是项目级配置，不会根据 Bridge 的 `session_key` 动态注入。因此，多设备不要共享一个固定 `OPENCLI_PROFILE` 的 project。

以设备 `sxh-browser` 为例：

```toml
[bridge]
enabled = true
port = 9810
token = "替换为-bridge-token"
path = "/bridge/ws"
cors_origins = ["*"]

[[projects]]
name = "opencli-sidebar-sxh"
show_context_indicator = true
inject_sender = false
reset_on_idle_mins = 20

[projects.display]
thinking_messages = false
tool_messages = false
mode = "quiet"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/home/workspace/opencli-sidebar"
mode = "yolo"
provider = "ibrain"

[[projects.agent.providers]]
name = "ibrain"
model = "sonnet"

[projects.agent.providers.env]
IS_SANDBOX = "1"
OPENCLI_PROFILE = "sxh-browser"
OPENCLI_BROWSER_SESSION = "sidebar"
OPENCLI_TARGET_POLICY = "bound-only"
```

三项 OpenCLI 变量缺一不可：

```text
OPENCLI_PROFILE=sxh-browser
OPENCLI_BROWSER_SESSION=sidebar
OPENCLI_TARGET_POLICY=bound-only
```

如果实际使用的 provider 不是 `ibrain`，应将环境变量放到实际被选择的 provider 下。

每增加一台设备，新增独立凭证和独立 project，例如：

```text
deviceId=alice-browser  → project=opencli-sidebar-alice → OPENCLI_PROFILE=alice-browser
deviceId=bob-browser    → project=opencli-sidebar-bob   → OPENCLI_PROFILE=bob-browser
```

### 6.2 重启和验证 Bridge

```bash
cc-connect daemon restart
ss -tlnp | grep 9810
```

应能从用户电脑访问：

```text
ws://<虚机地址>:9810/bridge/ws
```

修改 project/provider 环境后，应重启 cc-connect，并重新创建或重连 Agent 会话，避免旧 Agent 继续保留旧环境。

## 7. 构建和打包浏览器扩展

以下步骤在持有源码的构建机执行，不会安装或修改用户电脑上的 OpenCLI CLI。

### 7.1 构建

在仓库根目录执行：

```bash
cd extension
npm ci
npm run typecheck
npm run build
npm run package:release -- --out ../extension-package
cd ..
```

打包结果目录：

```text
extension-package/
```

其中应直接包含 `manifest.json`，不能多套一层目录：

```text
extension-package/
├─ manifest.json
├─ dist/background.js
├─ sidepanel.html
├─ sidepanel.js
├─ popup.html
├─ popup.js
└─ icons/
```

Linux 创建 ZIP：

```bash
EXT_VERSION="$(node -p "require('./extension/package.json').version")"
cd extension-package
zip -r "../opencli-extension-v${EXT_VERSION}.zip" .
cd ..
```

PowerShell 创建 ZIP：

```powershell
$extVersion = node -p "require('./extension/package.json').version"
Compress-Archive -Path .\extension-package\* `
  -DestinationPath ".\opencli-extension-v$extVersion.zip" `
  -Force
```

当前预期文件名：

```text
opencli-extension-v1.0.25.zip
```

## 8. 安装或更新 Chrome 扩展

### 8.1 首次安装

1. 解压 `opencli-extension-v1.0.25.zip`。
2. 打开 `chrome://extensions`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择直接包含 `manifest.json` 的目录。

### 8.2 更新现有解压扩展

为了尽量保持扩展 ID 和已有配置不变：

1. 记下当前扩展加载目录。
2. 将新包解压并覆盖到同一个目录。
3. 打开 `chrome://extensions`。
4. 找到 OpenCLI，点击“重新加载”。
5. 重新打开 Side Panel，检查版本和连接状态。

不要先删除扩展再从另一个随机目录重新加载，否则解压扩展的 ID 可能变化，本地配置也可能无法沿用。

扩展重新加载会重启 Manifest V3 Service Worker，因此 Browser 通道和 Bridge 通道会短暂断开并自动重连。若未恢复，打开 Side Panel 后点击保存/重连。

## 9. 配置浏览器扩展

在用户电脑的 OpenCLI Side Panel →“配置”中填写：

```text
模式：remote

Daemon Base URL：
http://10.133.4.192:19825

Device ID：
sxh-browser

Device Token：
<opencli device issue 输出的 Token>

Remote Token：
留空

Bridge WS URL：
ws://10.133.4.192:9810/bridge/ws

Bridge Token：
<cc-connect [bridge].token>

cc-connect Project：
opencli-sidebar-sxh
```

填写规则：

- `Device ID` 必须与 daemon 签发的 ID、Agent 的 `OPENCLI_PROFILE` 完全一致。
- `Device Token` 必须与该 Device ID 配套。
- `cc-connect Project` 必须与 `[[projects]].name` 完全一致。
- 使用设备凭证后将 `Remote Token` 留空。
- Daemon 使用 HTTP URL；Bridge 使用 WebSocket URL。

保存后预期状态：

```text
浏览器接线：已连接 (remote)
Agent Bridge：已连接
```

设备模式下 Side Panel 的会话键形如：

```text
opencli-sidebar:sxh-browser:sxh-browser
```

## 10. 绑定标签与粘性操作

1. 打开希望 Agent 操作的普通 `http://` 或 `https://` 页面。
2. 打开 OpenCLI Side Panel。
3. 点击“绑定当前标签”，或在首次发送时完成一次绑定。
4. 确认目标 chip 显示 `BOUND` 和正确的页面标题/URL。
5. 发送任务后可以切换到其他标签，Agent 仍应操作原绑定标签。

目标状态：

| 状态 | 含义 |
|---|---|
| `UNBOUND` | 尚未选择目标页面 |
| `BOUND` | 已绑定，可发送任务 |
| `BUSY` | Agent 正在操作；不允许中途重绑定 |
| `BROKEN` | 原标签关闭或变为不可调试页面，需要显式重新绑定 |

`bound-only` 模式不会偷偷新建标签。没有有效绑定时返回 `bound_target_required`；依赖自建标签的 Adapter 返回 `adapter_requires_owned_tab`，应改用普通 CLI 工作流，而不是移除保护配置。

## 11. 完整验收

### 11.1 服务端基础检查

```bash
opencli --version
opencli daemon status
opencli device list --registry /var/lib/opencli/devices.json
curl -s http://127.0.0.1:19825/status
opencli profile list
```

应满足：

- daemon 和 CLI 版本一致。
- 认证模式为 `device-credentials`。
- `sxh-browser` 状态为 active。
- 扩展连接后，profile 列表包含 `sxh-browser`。

### 11.2 显式路由检查

浏览器已经连接并绑定标签后，在虚机执行：

```bash
OPENCLI_PROFILE=sxh-browser \
OPENCLI_BROWSER_SESSION=sidebar \
OPENCLI_TARGET_POLICY=bound-only \
opencli browser sidebar state
```

应返回已绑定页面状态，且不会创建新标签。

故意不指定 profile：

```bash
env -u OPENCLI_PROFILE opencli browser sidebar state
```

设备模式下应失败并返回 `profile_required`。这是防止串台的正确行为。

### 11.3 Side Panel 端到端检查

发送只读任务：

```text
告诉我当前绑定页面的标题和网址，不要修改页面。
```

再执行粘性目标测试：

1. 在标签 A 绑定 Side Panel。
2. 发送一个需要数秒的任务。
3. 切换到标签 B 做其他事情。
4. 等任务完成后切回标签 A。
5. 确认操作发生在 A，且没有新建标签。

## 12. 日志和排障入口

### 12.1 OpenCLI daemon

```bash
opencli daemon status
curl -s http://127.0.0.1:19825/status
curl -s http://127.0.0.1:19825/logs
```

清理 daemon 内存日志：

```bash
curl -s -X DELETE http://127.0.0.1:19825/logs
```

需要更多 CLI 调试输出时，可在对应 Agent/终端临时设置：

```bash
export OPENCLI_VERBOSE=1
```

### 12.2 Chrome 扩展

1. 打开 `chrome://extensions`。
2. 找到 OpenCLI。
3. 点击扩展的“Service Worker”检查链接。
4. 在 DevTools Console 查看 `[opencli]` 日志。
5. Side Panel 自身的连接日志也会显示重连、鉴权失败和 Bridge 注册结果。

注意：切换普通标签不应该断开 Browser 通道或 Agent Bridge。Side Panel UI 被浏览器冻结/重建时，Bridge 连接由 Background Service Worker 持有；若仍随标签切换断线，应优先确认加载的是 `1.0.25` 新包，而不是旧目录或旧 Service Worker。

### 12.3 cc-connect

```bash
cc-connect daemon status
```

cc-connect 的日志位置取决于其启动方式：

- systemd：查看对应服务的 `journalctl`。
- 前台启动：查看当前终端输出。
- 自带 daemon 管理：使用当前版本提供的 status/log 命令。

重点搜索：project 名、`session_key`、Agent 启动、provider 环境和 Bridge 断开原因。

## 13. 常见错误

| 错误/现象 | 原因 | 处理 |
|---|---|---|
| `device_credentials_required` | 扩展没有同时提供 Device ID 和 Device Token | 补齐两项并保存重连 |
| `device_unknown` | daemon 当前登记表中没有该 ID | 使用同一个 `--registry` 查看；确认 daemon 继承了正确路径 |
| `device_token_invalid` | Token 复制错误或与 ID 不配套 | 吊销旧设备后重新签发并更新扩展 |
| `device_revoked` | 设备已被吊销 | 使用新的设备凭证 |
| `profile_required` | Agent/CLI 没有指定设备 | 配置 `OPENCLI_PROFILE=<deviceId>` 并重启 Agent 会话 |
| `profile-disconnected` | 指定设备当前未连接 | 检查扩展状态、URL、凭证和网络 |
| `bound_target_required` | Side Panel 没有有效绑定目标 | 回到目标网页，显式绑定当前标签 |
| `sidebar_session_required` | Agent 使用了错误 browser session | 设置 `OPENCLI_BROWSER_SESSION=sidebar` |
| `adapter_requires_owned_tab` | Adapter 必须自建自动化标签 | 改用普通 CLI project，不要移除 `bound-only` |
| 扩展一直重连 | URL/端口不可达、凭证错误，或 daemon 未以设备模式启动 | 联查 `/status`、`/logs`、扩展 Service Worker Console |
| Agent Bridge 已连接但不操作浏览器 | Agent 没装/没找到 VM 上的 OpenCLI，或 profile 没注入 | 在 Agent 实际环境检查 `command -v opencli`、版本和三项变量 |
| daemon 显示 stale | 后台 daemon 与当前 CLI 版本不同 | 使用正确二进制停止旧 daemon，再从同一环境启动 |
| 本地模式扩展显示未连接 | 当前扩展配置实际指向远程 daemon，或本地 daemon 未运行 | 远程使用场景下属于正常；一个扩展实例一次只连接一个 daemon endpoint |

## 14. 吊销和重新签发

吊销：

```bash
opencli device revoke sxh-browser \
  --registry /var/lib/opencli/devices.json
```

吊销后，新连接会被拒绝。当前在线连接可在断开重连时失效；需要立即确保断开时可重启 daemon：

```bash
opencli daemon restart
```

同名设备被吊销后，可根据当前版本行为重新签发；如果提示同名不可用，则签发一个新 ID，并同步修改：

1. 扩展的 Device ID/Token。
2. cc-connect project 的 `OPENCLI_PROFILE`。
3. 必要时 project 名称。

## 15. 多设备扩容模板

每新增一台浏览器：

1. 签发唯一的 `deviceId + deviceToken`。
2. 新增一个 cc-connect project。
3. project 内设置 `OPENCLI_PROFILE=<deviceId>`。
4. 扩展配置同一个 `deviceId`，并选择该 project。
5. 验证两个设备同时在线且互不串台。

示例：

```text
浏览器 A
  deviceId=alice-browser
  project=opencli-sidebar-alice
  Agent OPENCLI_PROFILE=alice-browser

浏览器 B
  deviceId=bob-browser
  project=opencli-sidebar-bob
  Agent OPENCLI_PROFILE=bob-browser
```

同一个 `deviceId` 在两台浏览器同时使用时，后连接可能替换该设备的旧连接。每台浏览器必须使用不同 ID。

## 16. 回滚

### 16.1 回滚扩展版本

1. 将旧扩展包覆盖回原加载目录。
2. 在 `chrome://extensions` 点击“重新加载”。
3. 打开 Side Panel 检查配置和连接。

### 16.2 临时回滚到 Shared Token

仅用于单人应急：

1. 停止 daemon。
2. 取消 `OPENCLI_DEVICE_REGISTRY`，并确保默认 `~/.opencli/devices.json` 不会触发设备模式。
3. 设置 `OPENCLI_REMOTE_TOKEN`。
4. 启动 daemon。
5. 扩展清空 Device ID/Token，填写相同 Remote Token。

Shared Token 模式会恢复“唯一活跃扩展”，多人同时连接会互相顶替，因此不能作为长期多用户方案。

## 17. 发布前检查清单

### 服务端

- [ ] `opencli --version` 与 daemon 版本一致
- [ ] `OPENCLI_DEVICE_REGISTRY` 已持久化
- [ ] `OPENCLI_DAEMON_BIND` 已持久化
- [ ] 未长期保留 `OPENCLI_REMOTE_TOKEN`
- [ ] `/status` 显示 `device-credentials`
- [ ] 19825/9810 仅对受控网络开放

### 每台设备

- [ ] Device ID 唯一
- [ ] Device Token 已安全分发
- [ ] cc-connect project 独立
- [ ] `OPENCLI_PROFILE` 与 Device ID 一致
- [ ] `OPENCLI_BROWSER_SESSION=sidebar`
- [ ] `OPENCLI_TARGET_POLICY=bound-only`
- [ ] 扩展显示 Browser 和 Agent Bridge 均已连接
- [ ] 已绑定正确标签
- [ ] 切换标签后仍操作原绑定目标
- [ ] 未出现新建标签

## 18. 相关文档

- [多租户设备凭证设计与迁移](./multi-tenant-device-credentials.md)
- [侧边栏远程 OpenCLI](./sidebar-remote-opencli.md)
- [侧边栏专用 cc-connect 项目配置](./sidebar-cc-connect-project.zh-CN.md)
- [浏览器接线说明](./browser-bridge.md)

