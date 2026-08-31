## ADDED Requirements

### Requirement: 扩展出站连接远程接线服务

本机扩展 MUST 能够出站连接服务端远程接线端点，使服务端在本机未安装 opencli 的情况下仍可下发浏览器命令。

#### Scenario: 扩展携带 token 出站连接

- **WHEN** 扩展配置了有效的远程接线 URL 与 token
- **THEN** 扩展 MUST 建立并维持与服务端的会话连接，并上报可识别的连接标识

#### Scenario: 连接失败

- **WHEN** 远程接线 URL 不可达或 token 被拒绝
- **THEN** 扩展 MUST 进入失败/重试状态，且服务端对该扩展的命令路由 MUST 不可用

### Requirement: 服务端 opencli 经远程会话执行浏览器命令

运行在服务端的 opencli MUST 能将 browser 相关命令路由到已连接的目标扩展，并返回与现有协议语义兼容的结果（成功数据或可机读错误）。

#### Scenario: 远程执行 browser 命令成功

- **WHEN** 目标扩展在线且服务端执行一条支持的 browser 命令（例如 state / navigate / network-capture 等既有动作之一）
- **THEN** 命令 MUST 在目标浏览器上下文执行，并将结果返回给服务端 opencli 调用方

#### Scenario: 目标扩展离线

- **WHEN** 服务端执行 browser 命令但无可用扩展连接
- **THEN** opencli MUST 失败并返回明确错误，指示扩展未连接

### Requirement: 本机不依赖本地 daemon

在远程接线模式下，用户本机 MUST NOT 被要求安装或运行 opencli CLI / 本机 daemon 才能完成侧边栏驱动的浏览器任务。

#### Scenario: 仅安装扩展即可受控

- **WHEN** 本机仅安装并配置了扩展（含远程接线），服务端已部署 opencli 与接线服务
- **THEN** 服务端发起的浏览器命令 MUST 能通过扩展在本机 Chrome 中执行

### Requirement: MVP 多连接路由策略

在缺少用户账号体系时，系统 MUST 定义明确的多扩展连接路由行为，避免静默串台。

#### Scenario: 唯一活跃连接

- **WHEN** MVP 配置为唯一活跃连接且已有扩展 A 在线时扩展 B 尝试连接
- **THEN** 系统 MUST 拒绝 B 或顶替 A，并 MUST 使后续命令只打向当前唯一活跃连接（行为 MUST 在文档中固定一种）

#### Scenario: 无连接时的命令

- **WHEN** 没有任何扩展连接时服务端调用 browser 命令
- **THEN** 系统 MUST 返回可机读的「无扩展连接」错误
