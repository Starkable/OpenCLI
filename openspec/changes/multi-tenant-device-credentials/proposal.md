## Why

当前 `sidebar-remote-opencli` MVP 在远程模式下采用「唯一活跃扩展」互踢策略，且全员共用一把 `OPENCLI_REMOTE_TOKEN`。多人同时使用共享服务时会互相顶掉连接，也无法保证命令只打到本人浏览器。需要在不做完整用户 SSO 的前提下，用**每设备凭证**支持多扩展并行在线、强制按设备路由，避免串台。

## What Changes

- **BREAKING**：废除远程模式「唯一活跃连接」互踢策略；允许多个扩展同时连接同一 daemon。
- 引入 **deviceId + deviceToken** 设备凭证：扩展连接时按设备鉴权，不再依赖全局共享 remote token 作为唯一身份。
- daemon 按 **deviceId（与现有 contextId / profile 对齐）** 维护多连接映射；命令必须显式指定目标设备。
- **BREAKING（remote 多租户）**：无显式 `--profile` / `OPENCLI_PROFILE` / `contextId` 时，命令 MUST 失败，禁止「只剩一台就自动选用」的静默 fallback。
- 侧边栏配置改为填写本机设备凭证；`session_key` / `user_id` 按设备区分，避免多人挤同一 Agent 会话。
- Agent 运行时会话与 deviceId 绑定（环境变量或等价注入），保证 skills 调用 opencli 时打到正确扩展。
- 提供简易 **签发 / 吊销** 设备凭证的运维手段（脚本或本地登记表即可）；完整 SSO、按人计费、一人多设备选择器后置。
- 兼容期：可保留全局 `OPENCLI_REMOTE_TOKEN` 作为「单租户/迁移」开关，但文档默认推荐设备凭证模式。

## Capabilities

### New Capabilities

- `device-credentials`: 设备凭证（deviceId + deviceToken）的登记、校验、吊销与扩展侧配置。
- `agent-device-binding`: Chat/Bridge 会话与 deviceId 绑定，并向 Agent/opencli 注入显式设备目标（如 `OPENCLI_PROFILE`）。

### Modified Capabilities

- `remote-extension-transport`: 废除唯一活跃互踢；多连接并存；按设备/profile 严格路由；无目标则失败。
- `side-panel-chat`: 使用设备凭证配置接线；会话标识按设备隔离。

## Impact

- **daemon**（`src/daemon.ts`、`src/remote-mode.ts`、`src/daemon-utils.ts`）：连接注册、鉴权、路由策略变更；可能新增设备登记存储。
- **扩展**（`extension/src/config.ts`、`background.ts`、side panel）：配置项从共享 token 升级为设备凭证；hello/鉴权携带 deviceId。
- **CLI / profile**：remote 多租户下强制显式 profile；文档与错误码更新。
- **cc-connect / 侧边栏**：`session_key` 组成规则变更；可能需 per-session 工作区或环境注入（薄胶水，视 cc-connect 能力而定）。
- **运维**：内网管理员签发设备凭证；吊销后扩展无法接线。
- **非目标**：完整 IdP/OAuth、一人多设备 UI、公网无 ACL 暴露、按调用计费。
- **依赖变更**：建立在已完成的 `sidebar-remote-opencli` 两层架构之上；不推倒 Chat/Browser 分端口模型。
