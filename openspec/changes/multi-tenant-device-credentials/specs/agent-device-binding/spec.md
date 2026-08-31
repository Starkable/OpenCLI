## ADDED Requirements

### Requirement: Chat 会话与 deviceId 对齐

侧边栏经 Bridge 提交的会话标识 MUST 与当前配置的 deviceId 对齐，避免多名用户共用同一 Agent 会话键。

#### Scenario: 不同设备使用不同 session_key

- **WHEN** 设备 A 与设备 B 分别配置了不同的 deviceId 并连接 Bridge
- **THEN** 两侧边栏发出的消息 MUST 使用彼此不同的 `session_key`（且 key 中 MUST 可区分 deviceId）

### Requirement: Agent 调用 opencli 时携带显式设备目标

与某 deviceId 绑定的 Agent 会话在调用服务端 opencli 执行 browser 相关命令时，MUST 携带显式设备目标（例如环境变量 `OPENCLI_PROFILE` 等于该 deviceId，或等价的 `--profile`），不得依赖「当前唯一连接」推断。

#### Scenario: 绑定会话执行 browser 命令打到本设备

- **WHEN** 设备 A 的侧边栏会话触发 Agent 执行 opencli browser 命令，且设备 A 扩展在线
- **THEN** 该命令 MUST 路由到 deviceId=A 的扩展，MUST NOT 路由到其他在线设备

#### Scenario: 缺少显式设备目标时失败

- **WHEN** 在设备凭证（多租户）模式下 Agent 或 CLI 调用 opencli browser 相关命令但未提供显式设备目标
- **THEN** 调用 MUST 失败并返回可机读错误，指示需要指定 profile/device

### Requirement: 绑定缺失时的可观测性

当会话无法解析出 deviceId 绑定（配置缺失或注入失败）时，系统 MUST 让用户或运维可感知失败，而不是静默打到错误设备。

#### Scenario: 未配置 deviceId 时提示

- **WHEN** 侧边栏处于远程多租户预期下但未配置 deviceId
- **THEN** 侧边栏或接线状态 MUST 显示配置不完整，且 MUST NOT 宣称浏览器通道已就绪
