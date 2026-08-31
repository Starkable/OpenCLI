## ADDED Requirements

### Requirement: 侧边栏配置并使用设备凭证

侧边栏/扩展配置界面 MUST 支持填写远程接线 URL、deviceId 与 deviceToken，并将浏览器接线状态与设备身份关联展示。

#### Scenario: 配置设备凭证后显示接线状态

- **WHEN** 用户保存有效的 deviceId、deviceToken 与接线 URL
- **THEN** 侧边栏 MUST 展示浏览器接线通道的连接状态（已连接/失败/重连中）

### Requirement: 按设备隔离 Bridge 会话标识

侧边栏发往 cc-connect Bridge 的 `session_key`（及用于区分用户的 `user_id`）MUST 基于当前配置的 deviceId 区分，MUST NOT 让所有远程用户共用同一固定会话键。

#### Scenario: 发送任务使用设备相关 session_key

- **WHEN** 用户在已配置 deviceId 的侧边栏提交任务
- **THEN** 发往 Bridge 的消息 MUST 使用包含该 deviceId 的 `session_key`

## MODIFIED Requirements

### Requirement: 使用 Token 连接 Bridge

侧边栏与 cc-connect Bridge 之间的连接 MUST 携带配置的 Bridge token；MVP MUST NOT 强制完整用户账号登录。浏览器接线身份与 Bridge token 解耦：浏览器侧使用设备凭证，Chat 侧可继续使用（共享或分发的）Bridge token。

#### Scenario: 配置 Bridge token 后成功连接

- **WHEN** 扩展已配置有效的服务端 Bridge URL 与 Bridge token
- **THEN** 侧边栏 MUST 能建立 Bridge 连接并显示已连接状态

#### Scenario: Bridge token 无效或缺失

- **WHEN** Bridge token 缺失或被服务端拒绝
- **THEN** 侧边栏 MUST 显示连接失败原因，且 MUST NOT 静默发送任务
