## Context

OpenCLI 现状为：本机 CLI → 本机 daemon（`localhost:19825`）→ Browser Bridge 扩展 → Chrome。Agent 侧通过 Cursor / Claude 等桌面环境 + skills 调用 `opencli`。该路径要求用户本机安装 opencli，且交互不在浏览器内。

本变更将交互入口迁到扩展 Side Panel，将 Agent 与 opencli 部署到服务端内网；本机仅保留扩展。层 1（人机 Chat）与层 2（浏览器命令）必须分开设计，避免与 page-agent「扩展内 LLM」模型混淆。

约束：内网部署；MVP 使用连接 token、不做完整用户登录；先落地再优化。

## Goals / Non-Goals

**Goals:**

- 侧边栏经 cc-connect Bridge（带 token）与服务端 Agent 会话交互。
- 服务端 opencli 经远程扩展接线操控本机 Chrome；本机不装 opencli。
- 复用现有扩展执行语义（CDP、network-capture、bind、tabs 等）与 opencli browser / adapter / skills 心智。
- Agent 运行时可切换 Cursor CLI / Claude CLI，架构上预留 Pi Agent。
- Chat 与 Browser 通道分端口/分职责，便于演进。

**Non-Goals:**

- MVP 完整用户账号、OAuth、按人吊销与计费。
- 扩展内主路径直连 LLM（page-agent 式 MacroTool 环）。
- 公网无鉴权暴露接线端口。
- 将全部站点 adapter 逻辑搬进扩展。
- Electron / 桌面 CDP 适配器改造。
- 实现 Pi Agent 本体（仅预留插拔点）。

## Decisions

### D1：两层架构（Chat vs Browser）

- **决定**：层 1 用 cc-connect 托管 Agent 与侧边栏 Chat；层 2 独立实现「服务端 opencli ↔ 本机扩展」远程传输。
- **原因**：cc-connect 已解决多 Agent CLI、会话、Bridge 外部 UI；浏览器遥控属于 opencli 既有协议，不应塞进 Chat 网关。
- **备选**：自研薄网关串行 spawn Cursor CLI — 可行但会重复造会话/多 Agent；仅作备用。

### D2：侧边栏对接 cc-connect Bridge

- **决定**：Side Panel 作为 Bridge 外部 adapter（WebSocket + REST），连接携带 token。
- **原因**：与「连接带 token、先实现再优化」一致；Bridge 已支持自定义 UI。
- **备选**：侧边栏直连某种 CLI stdio — 难做流式/多轮，且绑死单一运行时。

### D3：远程扩展传输替代本机 daemon（对用户）

- **决定**：扩展出站连接服务端「远程接线」服务；服务端 opencli 通过该会话下发与现有 `Command`/`Result` 尽量兼容的动作。本机不再依赖 `127.0.0.1:19825`。
- **原因**：opencli 与浏览器不在同一台机器时，localhost daemon 不可用；出站连接利于内网穿透与防火墙。
- **备选**：SSH 反代本机 daemon — 要求本机仍跑 opencli/daemon，违背「本机不装 opencli」。

### D4：连接 token，不做用户登录（MVP）

- **决定**：cc-connect Bridge token + 远程接线 token（可同源或分发）；侧边栏无登录墙。
- **原因**：内网 MVP；完整账号后置。
- **备选**：完全无 token — 拒绝（内网横向风险过大）；完整 IdP — 后置。

### D5：多扩展路由默认

- **决定**：MVP 默认「同时仅允许一个活跃扩展连接」或「任务绑定显式 connectionId」；优先实现唯一连接 + 明确错误。
- **原因**：无用户体系时无法按账号路由。
- **备选**：侧边栏手动选择设备 — 可作为紧随其后的增强。

### D6：Tab / Session 绑定

- **决定**：侧边栏任务默认关联「当前前台 tab」或显式 `bind`；browser session 名由 Agent/skills 按现有 opencli 约定使用。
- **原因**：对齐现有 `bind` / `browser <session>` 心智，减少误操作。

### D7：Agent 权限模式

- **决定**：无人值守侧边栏场景配置 YOLO / auto（或等价），避免卡在 allow/deny；若需人工确认，侧边栏必须能回传权限事件（后续增强）。
- **原因**：桌面 IM 式确认不适合浏览器侧边栏主路径。

### D8：端口与进程部署

- **决定**：Chat（cc-connect Bridge，如 9810）与 Browser 远程接线分端口；可同机部署。opencli CLI 在服务端通过新传输或本地兼容面访问接线层。
- **原因**：职责清晰、故障隔离；便于内网防火墙分别放行。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 持有 token 即可操控已登录浏览器 | 内网 ACL + token 轮换；后续升级为按设备签发 |
| cc-connect Bridge 仍为 Beta，协议可能变 | 侧边栏封装薄适配层；锁定版本并跟变更日志 |
| 多扩展串台 | MVP 唯一连接；错误信息明确 |
| 公网 RTT / `deadlineAt` 原按同机假设 | 内网先沿用；超时可配置并观察 |
| Agent 与 opencli 环境 PATH/skills 不一致 | 部署清单固化；`opencli doctor`（服务端视角）与扩展在线探针 |
| 扩展离线导致命令失败 | 侧边栏展示连接状态；命令失败返回可机读错误 |

## Migration Plan

1. 服务端部署 cc-connect、Agent CLI、opencli、远程接线服务；配置 Bridge token。
2. 发布带 Side Panel + 出站接线的扩展；配置服务端 URL 与 token。
3. 验证：侧边栏发任务 → Agent 调 opencli → 扩展操作页面。
4. 本机逐步卸载全局 opencli（可选）；保留扩展即可。
5. 回滚：停用远程接线与侧边栏；恢复本机 opencli + 原 Bridge 扩展行为（需保留兼容或双模开关）。

## Open Questions

- 远程接线是独立进程，还是与 opencli daemon 同进程扩展「监听模式」？（建议独立或清晰模块边界，但 MVP 可同机。）
- 服务端 opencli 调用接线层：子进程 CLI + 环境变量指定传输，还是进程内 API？（建议 MVP 环境变量/配置切换传输，少改调用方。）
- Pi Agent 的具体 CLI 接口与 cc-connect 是否已有 adapter？（后置；先保证 type 可配置。）
- 多轮 Agent session 与 browser session 命名是否 1:1 绑定？（建议松耦合：Chat session 独立，browser session 由 skills 管理。）
