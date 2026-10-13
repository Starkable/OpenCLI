## Context

侧栏远程架构分两层：

- Chat：Side Panel ↔ cc-connect Bridge（`register` + `message`）
- Browser：扩展 ↔ opencli daemon（设备凭证 / 共享 token）

多租户设备凭证已解决 daemon 并行与 `OPENCLI_PROFILE` 串台问题，并要求「一人一 cc-connect Project」。但扩展仍硬编码：

- `extension/src/background.ts`：`AGENT_BRIDGE_PLATFORM = 'opencli-sidebar'`
- `extension/sidepanel.js`：`PLATFORM = 'opencli-sidebar'`，`session_key = opencli-sidebar:{deviceId}:{deviceId}`

cc-connect（`core/bridge.go`）用 `bs.adapters[platform]` 管理外部 adapter；同名注册会 `Close` 旧连接。回复经 `rc.Platform` → `sendToAdapter` 打回对应 WebSocket。因此多人共用固定 platform 会在 Bridge 层互踢，与 Project 是否不同无关。

约束：不改 cc-connect；不新增侧栏字段；沿用现有「一人一 Project」运维约定。

## Goals / Non-Goals

**Goals:**

- 多人同时连接 Bridge 时，各扩展占用独立 adapter 槽位，互不顶替。
- `register.platform`、`register.project`（若发送）、`message.project`、`session_key` 前缀在语义上对齐到同一 Project 名。
- 用户配置面零新增字段；单人/未填 Project 时行为可回退兼容。
- 文档与实现约定一致，便于排障。

**Non-Goals:**

- 独立 `bridgePlatform` 配置项或自动按 deviceId 生成与 Project 不同的 platform 名。
- 修改 daemon、CLI、设备签发流程或 `OPENCLI_PROFILE` 注入方式。
- 修改 cc-connect 以支持「同 platform 多 WebSocket」。
- 迁移/合并旧 `session_key` 下的历史会话。
- 完整 Project 命名国际化或复杂校验 UI。

## Decisions

### 1. platform 直接等于 `bridgeProject`

- **决定**：`resolveBridgePlatform(config) = config.bridgeProject.trim() || 'opencli-sidebar'`；register 与 session_key 共用该值。
- **理由**：运维已要求一人一 Project；同名兼任 platform 无需新字段、心智最少。cc-connect 中 `adapters` 与 `engines` 是两张表，字符串同名不冲突。
- **备选**：新增 `bridgePlatform` 字段 — 更灵活但易填错、与现有文档重复。拒绝。
- **备选**：`opencli-sidebar-{deviceId}` 自动推导且可与 Project 不同 — 需两套命名对齐，运维负担更大。拒绝（除非未来出现「多入口进同一 Project」需求）。

### 2. session_key 格式

- **决定**：`{platform}:{sanitize(deviceId)|local}:{sanitize(deviceId)|local}`，其中 `platform = resolveBridgePlatform(config)`。
- **理由**：协议约定 `{platform}:{scope}:{user}`；前缀必须等于已注册 platform，否则 `platformFromSessionKey` / 重建回复上下文可能失败。deviceId 段延续多租户约定。
- **备选**：继续固定前缀 `opencli-sidebar` 只改 register.platform — 前后缀不一致，回复路由风险。拒绝。

### 3. 空 Project 与校验

- **决定**：保留现有 UI「配置了 Bridge URL 必须填 Project」；代码层空值 fallback `opencli-sidebar`。可选：对 platform 字符做轻量 sanitize / 拒绝明显非法名（空格等），失败时在配置保存或注册日志中提示。
- **理由**：避免异常路径崩溃；主路径仍强制一人一 Project。

### 4. 消息上的 `project` 字段仍必带

- **决定**：侧栏发 `message` / `/stop` 时继续附带 `project: bridgeProject`（现状已有）。
- **理由**：当前 cc-connect 版本对 `register.project` 未强绑定 engine，路由主要依赖消息级 `project` + `resolveEngine`。只改 platform 不够。

### 5. 配置变更与重连

- **决定**：`agentBridgeConfigSignature` 已包含 `bridgeProject`；Project 变更会触发重连。session 身份在保存配置时通过 `applySessionIdentity` 刷新，须改为使用解析后的 platform。
- **理由**：避免旧 platform 槽位残留与新 Project 不一致。

### 6. 文档与产物同步

- **决定**：更新 guide 文档中的 platform/session_key 示例；构建后同步打包目录中的 sidepanel/background 产物。
- **理由**：多份扩展副本并存，漏同步会导致「源码已改、用户装的仍是旧常量」。

## Risks / Trade-offs

- [两人误填同一 Project] → 仍会互踢（与共用 OPENCLI_PROFILE 一样不支持）；文档强调一人一 Project；可选在日志中打印 platform 便于发现冲突。
- [升级后 session_key 变化导致旧会话不续] → 发布说明标注 BREAKING（会话键）；接受为新开会话。
- [Project 名含非法字符] → sanitize 或保存校验；约定使用小写字母、数字、连字符。
- [漏同步 extension-package] → tasks 明确打包/复制步骤与冒烟清单。
- [误以为只改 platform、不改 session_key] → 规格与设计同时约束两者一致。

## Migration Plan

1. 发布带本变更的扩展包；用户重新加载扩展。
2. 确认每人侧栏 Project 与 cc-connect `[[projects]].name`、Agent `OPENCLI_PROFILE` 仍一一对应。
3. 双人冒烟：两人同时「Agent Bridge：已连接」，互发消息互不顶替、回复回到本机侧栏。
4. 回滚：装回旧扩展包即可恢复写死 `opencli-sidebar`（多人场景会回到互踢）。

## Open Questions

- 是否在保存配置时对 Project 名做硬失败校验（非法字符直接拒绝），还是仅 sanitize？建议：MVP 以 trim + 非空为主，非法字符告警即可。
- `extension-package` 与 `opencli-extension-package` 是否均由现有 `npm run package:release` 覆盖？实施时核对构建脚本路径。
