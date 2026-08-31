## Why

当前用户必须在本机安装 opencli，并通过 Cursor / Claude 等桌面端与 Agent 交互，才能驱动已登录的浏览器。我们希望把交互入口改到浏览器侧边栏，把 opencli 与 Agent 部署到服务端内网，本机只保留扩展作为执行面，从而降低客户端安装成本，同时继续复用 opencli 的拦截、browser 原语与 adapter 能力。

## What Changes

- 扩展增加 **Side Panel**，作为人机交互入口（发任务、看流式回复、停止），不再依赖桌面 Agent 软件作为主 UI。
- 侧边栏经 **cc-connect Bridge**（连接携带 token）与服务端 Agent 会话通信；Agent 运行时为 Cursor CLI / Claude CLI，并预留 **Pi Agent** 等同类运行时插拔。
- 服务端安装并运行 **opencli**；Agent 通过 skills / CLI 调用 opencli，能力语义尽量保持不变。
- 新增 **远程扩展接线**：扩展出站连接服务端，使服务端 opencli 能将 browser 命令下发到本机扩展并回传结果（替代本机 `localhost:19825` daemon 路径）。
- 本机 **不再要求安装 opencli**（daemon / CLI）；本机仅需安装扩展。
- MVP 不做完整用户登录体系；使用 **连接 token**（内网共享密钥）即可。鉴权与多租户账号体系后置。
- 不把 page-agent 式「扩展内直连 LLM 主路径」作为本方案主执行引擎。

## Capabilities

### New Capabilities

- `side-panel-chat`: 浏览器侧边栏作为 Chat UI，经 token 连接 cc-connect Bridge，支持发任务、流式事件展示与停止。
- `remote-extension-transport`: 扩展出站连接服务端，按会话路由 browser 命令；服务端 opencli 使用远程传输替代本机 daemon。
- `agent-runtime-host`: 服务端通过 cc-connect 托管 Cursor / Claude（及后续 Pi Agent）CLI，与侧边栏解耦，并调用本机（服务器上的）opencli。

### Modified Capabilities

- （无）当前 `openspec/specs/` 下无既有 capability 需做需求级 delta。

## Impact

- **扩展**（`extension/`）：新增 Side Panel、出站连接与远程命令执行；保留现有 CDP / 拦截 / tab 等执行能力。
- **opencli 运行时**（`src/daemon.ts`、`src/browser/`）：新增或扩展「远程扩展会话」传输，使 CLI 在服务端可定位已连接扩展。
- **部署**：服务端需部署 cc-connect、Agent CLI、opencli；本机仅扩展。
- **依赖**：引入 cc-connect（Bridge）；Agent skills（如 `opencli-browser`）需在服务端 Agent 环境可用。
- **安全**：MVP 信任内网 + 连接 token；扩展可操作已登录浏览器，运维上需限制接线服务暴露面。
- **非目标（MVP）**：完整用户账号体系、公网无 token 暴露、扩展内主路径 LLM、本机 opencli 安装包、将上百 adapter 搬进扩展。
