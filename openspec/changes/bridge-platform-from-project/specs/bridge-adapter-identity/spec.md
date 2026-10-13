## ADDED Requirements

### Requirement: Bridge platform 源自已配置的 Project 名称

扩展向 cc-connect Bridge 发送 `register` 时，`platform` 字段 MUST 等于当前运行时配置中的 `bridgeProject`（去除首尾空白后）；当 `bridgeProject` 为空时，MUST fallback 为 `opencli-sidebar`。扩展 MUST NOT 再使用与配置无关的写死常量作为唯一 platform（除非处于上述空值 fallback）。

#### Scenario: 已配置 Project 时按 Project 注册

- **WHEN** 用户配置 `bridgeProject` 为 `opencli-sidebar-testA` 并成功连接 Bridge
- **THEN** 扩展发出的 `register` 消息 MUST 包含 `platform` 为 `opencli-sidebar-testA`

#### Scenario: 未配置 Project 时回退默认名

- **WHEN** `bridgeProject` 为空且扩展仍发起 Bridge 注册
- **THEN** `register.platform` MUST 为 `opencli-sidebar`

#### Scenario: 不同 Project 的两名用户互不顶替

- **WHEN** 用户 A 与用户 B 分别配置了不同的非空 `bridgeProject` 并同时连接同一 Bridge
- **THEN** 双方 MUST 能同时保持已注册状态，后连一方 MUST NOT 因 platform 同名而关闭先连一方的 Bridge WebSocket

### Requirement: session_key 前缀与 platform 一致

侧边栏发往 Bridge 的 `session_key` 前缀（第一个 `:` 之前的段）MUST 与当前用于 `register.platform` 的解析结果一致，格式为 `{platform}:{deviceSegment}:{deviceSegment}`，其中 `deviceSegment` 为 sanitize 后的 deviceId，缺省为 `local`。

#### Scenario: 有 deviceId 与 Project 时的会话键

- **WHEN** 用户配置 `bridgeProject=opencli-sidebar-testA` 且 `deviceId=testA` 并发送任务
- **THEN** 消息的 `session_key` MUST 为 `opencli-sidebar-testA:testA:testA`（deviceId sanitize 规则与现网一致）

#### Scenario: Project 变更后会话身份与注册一致

- **WHEN** 用户将 `bridgeProject` 从 `opencli-sidebar` 改为 `opencli-sidebar-testA` 并保存重连
- **THEN** 随后的 `register.platform` 与新消息的 `session_key` 前缀 MUST 同为 `opencli-sidebar-testA`

### Requirement: 不新增独立 platform 配置项

本能力 MUST 复用现有 `bridgeProject` 配置字段表达 Bridge platform 身份，MUST NOT 要求用户填写额外的 platform 专用输入框。

#### Scenario: 配置界面无新增 platform 字段

- **WHEN** 用户打开侧栏配置面板
- **THEN** 系统 MUST 仍通过「cc-connect Project 名称」表达该身份，MUST NOT 强制新增与 Project 并行的 platform 必填项
