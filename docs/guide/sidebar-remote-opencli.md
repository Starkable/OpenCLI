# 侧边栏远程 OpenCLI（Sidebar Remote OpenCLI）

> 内网 MVP：本机只装扩展；服务端跑 opencli daemon（远程模式）+ cc-connect Agent；侧边栏做人机入口。
>
> **多人并行请改用设备凭证模式**：见 [`multi-tenant-device-credentials.md`](./multi-tenant-device-credentials.md)。下文描述的共享 token + 唯一活跃策略仅适用于单租户试用。

## 架构

```text
本机 Chrome 扩展
  ├─ Side Panel ──token──► cc-connect Bridge :9810 ──► Cursor/Claude/Pi Agent
  └─ Background ──token──► opencli daemon :19825（服务端）──► 浏览器命令
服务端 opencli CLI ──► 127.0.0.1:19825（同机 loopback，对 Agent 透明）
```

两层端口建议分离：

| 通道 | 默认端口 | 环境变量 / 配置 |
|------|----------|-----------------|
| Browser 接线（daemon） | 19825 | `OPENCLI_REMOTE_TOKEN`、`OPENCLI_DAEMON_BIND`（或设备登记，见多租户文档） |
| Chat（cc-connect Bridge） | 9810 | cc-connect `[bridge]` token |

## 服务端：opencli 远程模式（共享 token / 单租户）

```bash
export OPENCLI_REMOTE_TOKEN='replace-with-long-random'
# optional: export OPENCLI_DAEMON_BIND=0.0.0.0
opencli daemon start   # or first browser command auto-starts daemon
```

行为：

- 设置 `OPENCLI_REMOTE_TOKEN` 且**未**启用设备登记时进入 **shared-token remote mode**：daemon 监听 `OPENCLI_DAEMON_BIND`（默认 `0.0.0.0:19825`）。
- 扩展 WS `/ext` **必须**携带同一 token（`?token=` / `Authorization: Bearer` / `X-OpenCLI-Remote-Token`）。
- **唯一活跃连接（仅共享 token 模式）**：新扩展 hello 会关闭旧扩展连接。
- HTTP `/command` **仅允许 loopback**，因此服务端 Agent 调 `opencli` 无需改调用方式（仍打本机 daemon）。

未设置 token / 设备登记时行为与经典本机模式一致（仅 `127.0.0.1`）。

> **BREAKING 演进**：启用 `OPENCLI_DEVICE_REGISTRY`（或 `~/.opencli/devices.json`）后改为多设备并行 + 强制 `--profile`，见多租户文档。

### Agent 环境（透明传输）

在 Agent（Cursor CLI / Claude CLI）的 work_dir / PATH 中安装 opencli 与 skills（如 `opencli-browser`）。只要 daemon 在同机以 remote mode 运行且扩展已出站连上，Agent 执行：

```bash
opencli browser sidebar state
```

即可遥控用户浏览器，**无需**为 CLI 配置远程 URL。

多人设备模式下必须：

```bash
export OPENCLI_PROFILE=<deviceId>
export OPENCLI_BROWSER_SESSION=sidebar
export OPENCLI_TARGET_POLICY=bound-only
opencli browser sidebar state
```

这三个维度含义不同：`OPENCLI_PROFILE` 选择哪台浏览器设备，
`OPENCLI_BROWSER_SESSION=sidebar` 选择设备里的侧栏会话，
`OPENCLI_TARGET_POLICY=bound-only` 强制只使用用户已绑定的标签且禁止静默创建标签/窗口。
共享 token 或本机模式可以省略 `OPENCLI_PROFILE`，但侧栏 Agent project 仍应设置后两个变量。

### cc-connect 示例（Chat）

独立 work_dir 与专用 project 完整示例见 [`sidebar-cc-connect-project.zh-CN.md`](./sidebar-cc-connect-project.zh-CN.md)。

```toml
[bridge]
enabled = true
port = 9810
token = "bridge-secret"
path = "/bridge/ws"

[[projects]]
name = "opencli-sidebar"

[projects.agent]
type = "claudecode"   # or "cursor"; Pi Agent later via adapter
# work_dir = "/home/workspace/opencli-sidebar"
# mode = "yolo"
```

侧边栏作为 Bridge 外部 adapter：`platform=opencli-sidebar`，capabilities 含 `text` / `preview` / `typing`。

预留 Pi Agent：将 `projects.agent.type` 换成 Pi 对应 adapter（实现不在本变更范围）。

## 本机：仅扩展

1. 加载带 Side Panel 的 OpenCLI 扩展。
2. 打开侧边栏 → **配置**：
   - 模式：`remote`
   - Daemon Base URL：`http://<server>:19825`
   - Remote Token：与 `OPENCLI_REMOTE_TOKEN` 相同
   - Bridge WS URL：`ws://<server>:9810/bridge/ws`
   - Bridge Token：与 cc-connect `[bridge].token` 相同
   - **cc-connect Project 名称**：与专用 `[[projects]].name` 一致（多项目必填，如 `opencli-sidebar`）
3. 保存并重连；确认「浏览器接线」「Agent Bridge」均为已连接。
4. 在希望操作的普通 `http(s)` 页面点击“绑定当前标签”（首次发送也会自动绑定一次）。
5. 绑定后可自由切换到其他标签；后续消息继续操作原标签，直到手动重新绑定、解除绑定，或原标签被关闭/变为不可调试页面。

侧栏目标会显示 `BOUND / BUSY / BROKEN`。`BUSY` 期间不允许重新绑定或解除绑定；
任务完成或发送 `/stop` 后恢复。Side Panel 关闭再打开时，目标和最近消息会从扩展后台恢复。

`bound-only` 下允许页面内的 state/click/type/select/navigate/screenshot/network 等操作；
`tab new/select/close`、窗口关闭会返回 `bound_tab_mutation_blocked`，没有有效绑定返回
`bound_target_required`。需要自建标签的 Browser/Cookie/Intercept/UI Adapter 会返回
`adapter_requires_owned_tab`，请改用普通 CLI 工作流执行，侧栏不会偷偷新建标签。

本机**不需要**安装 opencli CLI。

## 多连接策略（用户可见）

远程模式下同时只允许 **一个** 扩展保持连接。后连接的扩展会顶替先连接者；被顶替方会收到 policy 提示并断开。错误码：`extension_replaced`。

无扩展在线时，daemon `/status` 附带 `noExtension.errorCode = extension_offline`。

## 内网联调清单

1. 服务端：`OPENCLI_REMOTE_TOKEN` + daemon 已监听；`curl -s http://127.0.0.1:19825/ping` 返回 `remoteMode: true`。
2. 本机扩展 remote 配置正确；侧边栏显示浏览器接线已连接。
3. 服务端执行 `opencli browser sidebar state`（或先 `bind`）有结构化输出。
4. cc-connect Bridge 可连；侧边栏发送一句话能收到 Agent 回复。
5. Agent 在会话中调用 opencli 能操作本机页面。

## 安全说明（MVP）

- 不做完整用户登录；连接依赖 **共享 token**。
- 持有 token 即可操控已登录浏览器：限制内网 ACL，定期轮换 token。
- 后置：按用户/设备签发 token、账号体系。

## 回滚

1. 扩展配置改回 `mode=local`（连本机 `localhost:19825`）。
2. 服务端取消 `OPENCLI_REMOTE_TOKEN`，daemon 恢复仅 loopback。
3. 停止 cc-connect Bridge 或清空侧边栏 Bridge URL。

若只回滚 sticky target：部署上一版扩展（旧版 `preferBindActiveTab` 每次发送前重新绑定），
并从侧栏 Agent project 移除 `OPENCLI_BROWSER_SESSION`、`OPENCLI_TARGET_POLICY`。
普通 CLI 的 owned session 未使用 `bound-only`，不受该回滚影响。

双模并存：同一扩展可通过配置在 local / remote 间切换，无需卸装。

## 非目标（本 MVP）

- 完整 IdP / 多租户计费
- 扩展内直连 LLM 主路径
- 实现 Pi Agent 本体
- 公网无 token 暴露 daemon
