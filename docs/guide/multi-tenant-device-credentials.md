# 多租户设备凭证（Multi-tenant Device Credentials）

> **BREAKING**（相对 `sidebar-remote-opencli` MVP）：设备凭证模式下废除「唯一活跃互踢」；命令**禁止**无 `--profile` / `OPENCLI_PROFILE` 时的静默 fallback。共享 token 单租户模式仍保留互踢，仅作兼容。

在共享服务端上，为每台浏览器签发 `deviceId + deviceToken`，使多扩展并行在线且命令不串台。产品约定：**一人一设备**（不做设备选择器）。

## 架构

```text
扩展 A (deviceId=a) ──deviceToken──┐
扩展 B (deviceId=b) ──deviceToken──┼──► daemon :19825 ──按 --profile 路由──► 对应扩展
侧边栏 A session=opencli-sidebar:a:a ──► Bridge ──► Agent(OPENCLI_PROFILE=a) ──► opencli
侧边栏 B session=opencli-sidebar:b:b ──► Bridge ──► Agent(OPENCLI_PROFILE=b) ──► opencli
```

| 模式 | 启用条件 | 多连接 | 命令路由 |
|------|----------|--------|----------|
| **设备凭证（推荐）** | 存在 `OPENCLI_DEVICE_REGISTRY` 或 `~/.opencli/devices.json` | 多 deviceId 并存；同 id 顶替自身 | **必须**显式 `--profile` / `OPENCLI_PROFILE` |
| 共享 token（兼容） | 仅 `OPENCLI_REMOTE_TOKEN`、无设备登记文件 | **唯一活跃**互踢 | 可单连接自动选用（旧行为） |
| 本机 | 皆未配置 | 本机扩展 | 经典 profile 仲裁 |

## 服务端：签发与吊销

```bash
# 可选：显式指定登记文件（建议生产环境设置）
export OPENCLI_DEVICE_REGISTRY=/var/lib/opencli/devices.json

# 签发（明文 token 只打印一次；磁盘仅存 SHA-256）
opencli device issue
opencli device issue alice --note 'desk-alice'

# 列表 / 吊销
opencli device list
opencli device revoke alice
```

启动 daemon（设备模式会绑定 `0.0.0.0`，可用 `OPENCLI_DAEMON_BIND` 覆盖）：

```bash
export OPENCLI_DEVICE_REGISTRY=/var/lib/opencli/devices.json
# 可选：迁移期同时保留共享 token
# export OPENCLI_REMOTE_TOKEN='…'
opencli daemon start
```

日志应出现：`Auth mode=device-credentials … uniqueActive=false requireExplicitProfile=true`。

吊销后：新连接立即拒绝；已在线连接需断开重连或重启 daemon 后失效（登记表每次鉴权重读）。

## 扩展 / 侧边栏配置

1. 模式选 `remote`，填写 Daemon Base URL。
2. 填写 **Device Id** + **Device Token**（推荐）。
3. Bridge URL / Token 照常。
4. 保存后：`hello.contextId` = `deviceId`；`session_key` = `opencli-sidebar:{deviceId}:{deviceId}`。

未配置 device 凭证且未配置共享 Remote Token 时，侧边栏**不会**宣称浏览器通道就绪。

## Agent 必须带显式设备目标

设备模式下，下列调用会失败（`errorCode=profile_required`）：

```bash
opencli browser sidebar state          # 无 --profile / OPENCLI_PROFILE
```

正确示例：

```bash
export OPENCLI_PROFILE=alice           # 或 --profile alice
opencli browser sidebar state
```

### Spike：cc-connect 按 session 注入 env？

查阅本地 `cc-connect` 文档与配置模型后的结论：

- `work_dir` / `env` 是**项目级**配置，**不是**按 Bridge `session_key` 动态注入。
- 因此不能单靠一个共享 project、仅靠不同 `session_key` 自动得到不同的 `OPENCLI_PROFILE`。

推荐绑定方式（任选）：

1. **每设备一个 project / work_dir**，在该项目 `env` 中设置 `OPENCLI_PROFILE=<deviceId>`（与侧边栏 session 中的 deviceId 一致）。
2. 将 [`scripts/opencli-with-profile.mjs`](../../scripts/opencli-with-profile.mjs) 放在 Agent PATH 前，强制无 profile 即退出；真实二进制用 `OPENCLI_REAL_BIN` 指向。
3. 侧边栏会在消息前加 `[opencli-device:<id>]` 提示；**不可**作为唯一防串台手段，必须以 env/`--profile` 为准。

## 与共享 token MVP 对比

| | 共享 token MVP | 设备凭证 |
|--|----------------|----------|
| 鉴权 | 全局一把 `OPENCLI_REMOTE_TOKEN` | 每设备 token（hash 存盘） |
| 并行 | 互踢 | 多设备并行 |
| 串台防护 | 靠「只有一人连」 | 强制 profile + 会话隔离 |
| 适用 | 单人试用 | 内网多人 |

## 迁移清单

1. 服务端 `opencli device issue` 为每位用户签发凭证；分发 deviceId/token。
2. 设置 `OPENCLI_DEVICE_REGISTRY`，重启 daemon；确认日志为 `device-credentials`。
3. 用户扩展改为填 Device Id/Token；可清空共享 Remote Token。
4. Agent 项目设置 `OPENCLI_PROFILE` 或换用 `opencli-with-profile` 包装。
5. 双人冒烟：两台 Chrome 同时在线，各自侧边栏任务只操作本机；无 profile 调用应失败。
6. 回滚应急：删除/移走 devices.json，仅设 `OPENCLI_REMOTE_TOKEN` → 恢复唯一活跃共享模式（**BREAKING 回退**，仅临时）。

## 手动冒烟清单（双设备）

- [ ] 签发 `dev-a`、`dev-b` 两套凭证
- [ ] 两台机器扩展分别配置并显示「浏览器接线：已连接」
- [ ] `opencli profile list`（服务端）同时看到两个 contextId
- [ ] `OPENCLI_PROFILE=dev-a opencli browser …` 只影响 A
- [ ] 无 profile 调用返回 `profile_required`
- [ ] 吊销 `dev-b` 后 B 无法重连

相关：[`sidebar-remote-opencli.md`](./sidebar-remote-opencli.md)、[`sidebar-remote-agent-host.md`](./sidebar-remote-agent-host.md)。
