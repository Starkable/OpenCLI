## ADDED Requirements

### Requirement: 多设备扩展并行连接

在设备凭证模式下，远程接线服务 MUST 允许不同 deviceId 的扩展同时保持连接，且 MUST NOT 因新设备上线而断开其他设备。

#### Scenario: 两台设备同时在线

- **WHEN** 设备 A 与设备 B 均以有效凭证完成连接
- **THEN** 服务端 MUST 同时将 A 与 B 保留在可路由连接集合中

#### Scenario: 同设备重复连接顶替自身

- **WHEN** 已连接的 deviceId=A 再次以有效凭证建立新连接
- **THEN** 系统 MUST 以新连接作为 A 的活跃会话，并断开 A 的旧连接；其他 deviceId 的连接 MUST 保持不受影响

### Requirement: 按设备严格路由命令

服务端 opencli / daemon 在设备凭证模式下将 browser 命令路由到扩展时，MUST 使用调用方提供的显式设备目标（contextId / profile / deviceId），且 MUST NOT 在目标未声明时自动选择任一在线扩展。

#### Scenario: 显式目标命中在线设备

- **WHEN** 调用方指定 deviceId/profile=A 且 A 在线
- **THEN** 命令 MUST 仅下发到 A 的扩展会话

#### Scenario: 显式目标离线

- **WHEN** 调用方指定 deviceId/profile=A 但 A 不在线
- **THEN** 系统 MUST 失败并返回可机读的目标离线/未连接错误，MUST NOT 改写到其他设备

#### Scenario: 未指定目标

- **WHEN** 设备凭证模式下调用方未提供显式设备目标
- **THEN** 系统 MUST 失败并返回可机读错误（例如需要 `--profile`），即使当前仅有一个扩展在线

### Requirement: 无任何扩展时的命令

#### Scenario: 无连接时的命令

- **WHEN** 没有任何扩展连接时服务端调用 browser 命令
- **THEN** 系统 MUST 返回可机读的「无扩展连接」或等价错误

## REMOVED Requirements

### Requirement: MVP 多连接路由策略

**Reason**: 唯一活跃互踢与多人并行共享服务目标冲突；改由设备凭证模式下的多连接与严格路由替代。

**Migration**: 启用设备凭证模式；运维为每台浏览器签发 deviceId/deviceToken；CLI/Agent 必须显式 `--profile` / `OPENCLI_PROFILE`。应急单租户可临时关闭设备模式并恢复旧行为（仅文档标明的兼容路径）。

## MODIFIED Requirements

### Requirement: 扩展出站连接远程接线服务

本机扩展 MUST 能够出站连接服务端远程接线端点，使服务端在本机未安装 opencli 的情况下仍可下发浏览器命令。在设备凭证模式下，连接 MUST 携带 deviceId 与 deviceToken（而非仅依赖全局共享 remote token 作为设备身份）。

#### Scenario: 扩展携带设备凭证出站连接

- **WHEN** 扩展配置了有效的远程接线 URL、deviceId 与 deviceToken
- **THEN** 扩展 MUST 建立并维持与服务端的会话连接，并上报与 deviceId 一致的连接标识（contextId）

#### Scenario: 连接失败

- **WHEN** 远程接线 URL 不可达或设备凭证被拒绝
- **THEN** 扩展 MUST 进入失败/重试状态，且服务端对该扩展的命令路由 MUST 不可用
