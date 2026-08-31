## ADDED Requirements

### Requirement: 通过 cc-connect 托管 Agent 运行时

服务端 MUST 使用 cc-connect（或等价宿主）隔离外部 Chat 入口与 Agent 进程，并能够启动配置的 Agent CLI 处理侧边栏任务。

#### Scenario: 侧边栏任务到达 Agent

- **WHEN** 侧边栏经 Bridge 提交任务且项目配置的 agent 类型为 Cursor 或 Claude CLI
- **THEN** 宿主 MUST 将会话消息交给对应 Agent 运行时处理，并将 Agent 输出事件回传 Bridge 客户端

#### Scenario: 切换 Agent 类型配置

- **WHEN** 运维将项目 agent 类型从 Cursor 切换为 Claude（或反之）并重启/热加载生效
- **THEN** 新的侧边栏会话 MUST 由新配置的 Agent 运行时处理，侧边栏协议 MUST NOT 因此变更

### Requirement: Agent 调用服务端 opencli

Agent 运行环境 MUST 能够调用服务端安装的 opencli（含 browser 与既有 skills 约定），以完成浏览器操作。

#### Scenario: Agent 使用 opencli browser

- **WHEN** Agent 根据 skills 执行 `opencli browser`（或等价封装）且远程扩展在线
- **THEN** 该调用 MUST 经由远程扩展传输作用于用户浏览器，并将 CLI 结果纳入 Agent 后续推理上下文

### Requirement: 预留 Pi Agent 插拔

架构 MUST 将 Agent 运行时视为可配置后端，以便后续接入 Pi Agent 而无需改变侧边栏 Chat 协议与 opencli 远程传输协议。

#### Scenario: 新增 Pi Agent 不改入口协议

- **WHEN** 后续增加 Pi Agent 适配
- **THEN** 侧边栏 ↔ Bridge 的消息协议与扩展 ↔ 远程接线协议 MUST 保持兼容；变更 MUST 限于宿主侧 agent adapter 配置与实现

### Requirement: 无人值守权限模式可配置

面向侧边栏主路径的部署 MUST 支持配置为自动批准工具执行（YOLO/auto 或等价），避免默认卡在桌面式 allow/deny。

#### Scenario: YOLO 模式下工具自动执行

- **WHEN** 项目配置为 YOLO/auto 且 Agent 发起 opencli 工具调用
- **THEN** 宿主 MUST NOT 因等待即时人工批准而阻塞该调用（除非运维显式改为需确认模式）
