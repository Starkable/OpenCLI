## Why

多人通过 Chrome 侧栏同时连接同一套 cc-connect Bridge 时，扩展在 `register` 中把 `platform` 写死为 `opencli-sidebar`。cc-connect 按 `platform` 名维护 adapter 槽位，同名后连会顶替先连，导致先连用户收不到 Agent 回复。侧栏已支持按人配置「cc-connect Project 名称」与 deviceId，但 `platform` / `session_key` 前缀未与之对齐，多人并行在 Bridge 层仍然失败。

## What Changes

- 扩展 Bridge 注册时的 `platform` **不再写死** `opencli-sidebar`，改为使用侧栏已配置的 `bridgeProject`（cc-connect Project 名称）。
- `session_key` 前缀与上述 `platform` 保持一致：`{bridgeProject}:{deviceId}:{deviceId}`（无 deviceId 时仍可用 `local` 段，兼容单机）。
- **不新增**侧栏配置字段；用户继续按「一人一 Project」填写现有 Project 名称即可。
- 空 Project 时 fallback 为 `opencli-sidebar`，兼容未填/旧配置单人路径。
- **BREAKING（会话键）**：已配置独立 Project 的用户，升级后 `session_key` 前缀从固定 `opencli-sidebar` 变为 Project 名，cc-connect 侧旧会话历史不自动续接（视为新开会话）。
- 同步更新侧栏相关文档中关于 `platform` / `session_key` 的约定说明。
- **非目标**：不改 daemon 设备凭证、不改 CLI/`OPENCLI_PROFILE`、不改 cc-connect 本体、不新增独立 `bridgePlatform` 输入框。

## Capabilities

### New Capabilities

- `bridge-adapter-identity`: Bridge `register.platform` 与 `session_key` 前缀的解析规则（源自 `bridgeProject`，与 project 字段对齐，保证多人各占独立 adapter 槽位）。

### Modified Capabilities

- `side-panel-chat`: 会话标识不再使用写死的 `opencli-sidebar` 前缀；发往 Bridge 的身份与已配置 Project 一致。

## Impact

- **扩展**：`extension/src/background.ts`（`AGENT_BRIDGE_PLATFORM` / register）、`extension/sidepanel.js`（`PLATFORM` / `session_key`）；必要时轻量校验 Project 命名；打包产物 `extension-package` / `opencli-extension-package` 需同步。
- **配置面**：无新 UI 字段；依赖现有 `bridgeProject` + 已有「有 Bridge URL 必须填 Project」校验。
- **cc-connect**：无代码改动；运维继续一人一 `[[projects]].name`，该名称同时作为 Bridge platform。
- **文档**：`docs/guide/sidebar-remote-opencli.md`、`multi-tenant-device-credentials.md`、`opencli-device-credentials-deployment.zh-CN.md` 等中的 platform/session_key 说明。
- **依赖**：建立在已完成的 `sidebar-remote-opencli` 与 `multi-tenant-device-credentials` 之上；与「每设备 Project + OPENCLI_PROFILE」运维约定叠加，不互相替代。
