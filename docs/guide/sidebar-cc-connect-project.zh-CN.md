# 侧边栏专用 cc-connect 项目配置

浏览器 Side Panel **只走 Bridge WebSocket**，**不需要**也**不应**配置飞书/Telegram 等 IM 平台。

当全局 `[bridge] enabled = true` 时，cc-connect 允许 **Bridge 专用 project**（零个 `[[projects.platforms]]`）。Bridge 会在启动时自动挂到每个 project 的 Engine 上。

## 1. 虚机目录

```bash
mkdir -p /home/workspace/opencli-sidebar
cd /home/workspace/opencli-sidebar
npx skills add jackwener/opencli --skill opencli-browser
```

## 2. config.toml 追加（无飞书）

```toml
# ========== 浏览器侧边栏专用（Bridge only，无 IM 平台） ==========

[[projects]]
name = "opencli-sidebar"
show_context_indicator = true
inject_sender = false
reset_on_idle_mins = 20

[projects.display]
thinking_messages = false
tool_messages = false
mode = "quiet"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/home/workspace/opencli-sidebar"
mode = "yolo"
provider = "ibrain"

[[projects.agent.providers]]
name = "ibrain"
model = "sonnet"

[projects.agent.providers.env]
IS_SANDBOX = "1"
OPENCLI_BROWSER_SESSION = "sidebar"
OPENCLI_TARGET_POLICY = "bound-only"
# 设备凭证模式必须设置为本项目对应设备；共享 token / local 模式可省略
# OPENCLI_PROFILE = "alice"

# 注意：此处 intentionally 没有 [[projects.platforms]]
# 侧边栏用户通过 Chrome 扩展 + Bridge 接入，不走飞书机器人
```

全局 Bridge（字段名必须是 `enabled`）：

```toml
[bridge]
enabled = true
port = 9810
token = "你的-bridge-token"
path = "/bridge/ws"
cors_origins = ["*"]
```

## 3. 与飞书项目的区别

| | 飞书排障/质检/知识库 | opencli-sidebar |
|--|---------------------|-----------------|
| 用户入口 | 飞书 IM | Chrome Side Panel |
| 需要 `[[projects.platforms]]` | ✅ 要（feishu） | ❌ 不要 |
| 需要 Bridge | 可选 | ✅ 必须 `enabled = true` |
| work_dir | 各自目录 | `/home/workspace/opencli-sidebar` |

## 4. Chrome 扩展

Side Panel → **cc-connect Project 名称** 填：`opencli-sidebar`

其余：remote daemon URL/token、Bridge WS URL/token（见 [sidebar-remote-opencli.md](./sidebar-remote-opencli.md)）。

## 5. 重启验证

```bash
cc-connect daemon restart
ss -tlnp | grep 9810
```

Side Panel 发消息应进入 `opencli-sidebar` 项目，Agent 在 `/home/workspace/opencli-sidebar` 工作。

验证时先在侧栏固定一个普通网页标签，再切换到另一个标签发送命令。Agent 必须继续操作
原标签且不新建标签。若工具返回 `adapter_requires_owned_tab`，说明所用 Adapter 依赖自建标签，
应改到普通 CLI project 执行；不要移除 `bound-only` 来绕过保护。
