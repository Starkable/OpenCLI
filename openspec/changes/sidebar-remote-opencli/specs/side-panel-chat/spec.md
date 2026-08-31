## ADDED Requirements

### Requirement: 侧边栏作为 Chat 入口

扩展 MUST 提供 Side Panel，使用户无需桌面 Agent 软件即可向服务端 Agent 发送自然语言任务并查看回复。

#### Scenario: 用户打开侧边栏发送任务

- **WHEN** 用户打开扩展 Side Panel 并提交一条非空任务文本
- **THEN** 系统 MUST 将该消息发送至已配置的 cc-connect Bridge 会话，并在侧边栏展示后续 Agent 事件流（至少包含文本回复）

#### Scenario: 用户停止当前任务

- **WHEN** 用户在侧边栏触发停止操作且存在进行中的 Agent 执行
- **THEN** 系统 MUST 向 Bridge / Agent 宿主发出停止请求，并更新侧边栏状态为已停止或等价终态

### Requirement: 使用 Token 连接 Bridge

侧边栏与 cc-connect Bridge 之间的连接 MUST 携带配置的 token；MVP MUST NOT 强制用户账号登录。

#### Scenario: 配置 token 后成功连接

- **WHEN** 扩展已配置有效的服务端 Bridge URL 与 token
- **THEN** 侧边栏 MUST 能建立 Bridge 连接并显示已连接状态

#### Scenario: token 无效或缺失

- **WHEN** token 缺失或被服务端拒绝
- **THEN** 侧边栏 MUST 显示连接失败原因，且 MUST NOT 静默发送任务

### Requirement: 展示连接与运行状态

侧边栏 MUST 向用户展示与 Chat 通道相关的关键状态，避免用户在未连接时误以为任务已执行。

#### Scenario: Bridge 断开

- **WHEN** 与 Bridge 的连接断开
- **THEN** 侧边栏 MUST 显示断开/重连状态，并阻止或明确失败新的任务提交
