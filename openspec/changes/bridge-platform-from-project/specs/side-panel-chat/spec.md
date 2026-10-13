## MODIFIED Requirements

### Requirement: 按设备隔离 Bridge 会话标识

侧边栏发往 cc-connect Bridge 的 `session_key`（及用于区分用户的 `user_id`）MUST 基于当前配置的 deviceId 区分，MUST NOT 让所有远程用户共用同一固定会话键。`session_key` 的 platform 前缀 MUST 与当前解析的 Bridge platform（源自 `bridgeProject`，空则 `opencli-sidebar`）一致，MUST NOT 在已配置独立 Project 时仍写死为 `opencli-sidebar`。

#### Scenario: 发送任务使用设备相关 session_key

- **WHEN** 用户在已配置 deviceId 的侧边栏提交任务
- **THEN** 发往 Bridge 的消息 MUST 使用包含该 deviceId 的 `session_key`

#### Scenario: session_key 前缀跟随 Project

- **WHEN** 用户已配置非空 `bridgeProject` 与 deviceId 并提交任务
- **THEN** `session_key` MUST 以该 `bridgeProject` 为前缀，且 MUST 包含该 deviceId

## ADDED Requirements

### Requirement: 发往 Bridge 的消息继续携带 project

侧边栏向 Bridge 发送用户任务或停止指令时，在已配置 `bridgeProject` 的情况下 MUST 在消息中携带 `project` 字段，且其值 MUST 等于该 `bridgeProject`，以便 cc-connect 解析到正确的 project engine。

#### Scenario: 发送任务带 project

- **WHEN** 用户配置了 `bridgeProject` 并发送一条任务消息
- **THEN** 发往 Bridge 的 payload MUST 包含 `project` 等于该配置值

#### Scenario: 停止指令带 project

- **WHEN** 用户配置了 `bridgeProject` 并触发停止
- **THEN** 发往 Bridge 的停止消息 MUST 包含相同的 `project` 字段
