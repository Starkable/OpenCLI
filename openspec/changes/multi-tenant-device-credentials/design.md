## Context

`sidebar-remote-opencli` 已落地两层架构：侧边栏 ↔ cc-connect Bridge（Chat），扩展出站 ↔ 服务端 daemon（Browser）。远程模式下 daemon 使用全局 `OPENCLI_REMOTE_TOKEN`，并在 `registerExtensionConnection` 中执行**唯一活跃互踢**。侧边栏 `session_key` 固定为 `opencli-sidebar:local:user`。

约束：内网共享服务；暂不做完整用户 SSO；产品约定**一人一设备**（不做多设备选择器）；必须并行在线且互不串台。

利益相关方：内网终端用户（只装扩展）、运维（签发/吊销设备凭证）、Agent 宿主（cc-connect + CLI）。

## Goals / Non-Goals

**Goals:**

- 多扩展可同时连接同一远程 daemon，互不顶替。
- 以 deviceId + deviceToken 鉴定扩展身份；命令严格路由到指定设备。
- Chat 会话与 deviceId 对齐，Agent 调用 opencli 时自动带显式设备目标。
- 提供简易签发/吊销手段；文档与可机读错误清晰。

**Non-Goals:**

- 完整 IdP / OAuth / 按人计费。
- 一人多设备 UI 与设备切换器。
- 推倒 Chat/Browser 分端口模型或改写 cc-connect 核心。
- 公网无 ACL 暴露接线端口。

## Decisions

### D1：deviceId 对齐现有 contextId / profile

- **决定**：设备主键使用扩展 `hello.contextId`（可与运维签发的 `deviceId` 相同）；CLI 继续用 `--profile` / `OPENCLI_PROFILE` 指向该 id（或 alias）。
- **原因**：daemon 已按 `Map<contextId, connection>` 与 `resolveProfileRoute` 工作；避免并行再发明一套 id。
- **备选**：独立 `deviceId` 再映射到 contextId — 多一层表，MVP 无收益。

### D2：设备凭证登记表 + 连接鉴权

- **决定**：服务端维护设备登记（至少 `deviceId`、`tokenHash`、状态 active/revoked）；扩展 WS 升级时校验 `deviceId` + `deviceToken`。全局 `OPENCLI_REMOTE_TOKEN` 仅保留为**兼容/单租户**开关，默认文档推荐设备模式。
- **原因**：满足「每人一把钥匙」；吊销可落地；不必上 SSO。
- **备选**：继续共享一把 token + 仅靠 contextId 路由 — 无法防伪造他人 contextId；拒绝作为多租户方案。

### D3：废除唯一活跃互踢（设备模式下）

- **决定**：启用设备凭证模式时，**移除** remote unique-active 互踢；同 `deviceId` 重复连接可顶替本设备旧连接（单设备单连接），不同 `deviceId` 并存。
- **原因**：与「多人并行」目标一致；同设备顶替防止僵尸连接。
- **备选**：保留互踢 — 与产品目标矛盾。

### D4：remote 多租户下禁止静默 fallback

- **决定**：设备模式下，`/command` 与 CLI 路由：无显式 `contextId`（explicit profile）时 MUST 失败（如 `profile_required`），即使当前只连着一台扩展。
- **原因**：短暂「只剩一台」时自动选用会导致串台窗口；显式失败可追踪。
- **备选**：仅在 `connected.length > 1` 时要求显式 — 有竞态窗口，不采用。

### D5：侧边栏会话按设备隔离

- **决定**：`session_key` 形如 `opencli-sidebar:{deviceId}:{deviceId}`（或 `{deviceId}:{userSlug}`，MVP 一人一设备可用 deviceId 填两侧）；`user_id` 使用 deviceId（或派生值），避免全员共用 `sidebar-user`。
- **原因**：cc-connect 按 `session_key` 隔离 Agent 会话；与 Bridge 协议一致。
- **备选**：继续固定 session — 多人挤同一会话，拒绝。

### D6：Agent ↔ opencli 设备绑定

- **决定**：每个 Bridge 会话对应的 Agent 工作区 MUST 注入 `OPENCLI_PROFILE=<deviceId>`（或启动包装脚本写入等价配置），使 skills 调用 opencli 时默认带显式目标；若宿主暂不支持 per-session env，则用侧边栏/文档约定的包装命令或 skill 强制 `--profile`。
- **原因**：仅改 daemon 不够，串台常发生在 Agent 忘带 profile。
- **备选**：只改 prompt 让模型「记得带」— 不可靠，不作唯一手段。

### D7：发证方式（先运维脚本）

- **决定**：MVP 用管理命令/脚本生成 `deviceId`+明文 token，写入服务端登记文件（权限收紧）；用户把 token 填进扩展配置。吊销即改状态或删除条目。
- **原因**：内网交付最快；自助注册可后置。
- **备选**：扩展自生成 UUID 再向服务端申请 — 需额外注册 API 与审批流，可作 A2 增强。

### D8：一人一设备

- **决定**：本期不提供设备列表/切换 UI；一张凭证对应一台浏览器身份。
- **原因**：降低 Chat 绑定与产品复杂度；后续若要多设备再开 change。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 设备 token 泄露可操控对应用户浏览器 | 可吊销；内网 ACL；token 仅存 hash；文档禁止公网裸暴露 |
| cc-connect 不支持 per-session env | Spike 确认；不行则 session 级包装脚本 / skill 强制 `--profile` |
| Agent/skills 绕过 env 裸调 opencli | 设备模式关闭 fallback + CI/文档强调；可选 daemon 审计日志带 contextId |
| 与旧共享 token 部署并存混淆 | 明确模式开关与迁移文档；默认推荐设备模式 |
| 同 deviceId 被两人配置 | 运维流程一人一证；连接顶替会暴露冲突 |

## Migration Plan

1. 服务端启用设备登记；签发首批设备凭证。
2. 升级 daemon：设备模式多连接 + 强制显式 profile；关闭 unique-active。
3. 升级扩展与侧边栏：配置 deviceId/deviceToken；session_key 按设备。
4. 配置 Agent 会话注入 `OPENCLI_PROFILE`（或包装层）。
5. 验证：两台浏览器并行在线，各自侧边栏任务只操作本机；错 profile / 无 profile 失败可机读。
6. 回收或降级全局 `OPENCLI_REMOTE_TOKEN` 单租户用法。
7. 回滚：关闭设备模式，恢复共享 token + 唯一活跃（仅应急，需文档标明行为回退）。

## Open Questions

- cc-connect 当前版本是否已支持按 `session_key` 注入不同 env / work_dir？（实现前 spike；决定 D6 落点。）
- 设备登记存储：单文件 JSON vs SQLite？（建议 MVP JSON/YAML 文件，路径可配置。）
- Bridge token 是否也要 per-user？（本期可继续共享 Bridge token，靠 session_key 隔离；与设备 token 解耦。）
