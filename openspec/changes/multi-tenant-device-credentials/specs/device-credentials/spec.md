## ADDED Requirements

### Requirement: 设备凭证登记与校验

系统 MUST 支持以 deviceId 与 deviceToken 标识并校验远程扩展连接，使不同设备使用不同凭证接入同一接线服务。

#### Scenario: 有效设备凭证连接成功

- **WHEN** 扩展使用已登记且未吊销的 deviceId 与匹配的 deviceToken 连接远程接线端点
- **THEN** 服务端 MUST 接受该连接，并将其登记为该 deviceId 的活跃扩展会话

#### Scenario: 无效或已吊销凭证被拒绝

- **WHEN** 扩展提供的 deviceToken 与登记不匹配，或该 deviceId 已被吊销
- **THEN** 服务端 MUST 拒绝连接，且 MUST NOT 将会话纳入可路由扩展集合

### Requirement: 设备凭证签发与吊销

运维 MUST 能够签发新的设备凭证，并吊销既有凭证，使被吊销设备无法继续接线。

#### Scenario: 签发新设备

- **WHEN** 运维执行签发操作并指定或生成 deviceId
- **THEN** 系统 MUST 产生可配置到扩展的 deviceToken，并将该设备标记为可用

#### Scenario: 吊销设备

- **WHEN** 运维吊销某一 deviceId
- **THEN** 该设备后续连接 MUST 失败；若该设备当前在线，系统 MUST 断开其扩展会话（或在下一次鉴权/心跳时等效断开）

### Requirement: 扩展配置设备凭证

远程模式下，扩展 MUST 允许用户配置接线 URL、deviceId 与 deviceToken，并使用这些值建立出站连接。

#### Scenario: 保存设备配置后出站连接

- **WHEN** 用户在扩展配置中保存有效的远程 URL、deviceId 与 deviceToken
- **THEN** 扩展 MUST 使用该凭证尝试连接服务端，并在界面展示连接成功或失败状态
