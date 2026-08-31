# OpenCLI 侧边栏远程模式 — cc-connect / Agent 部署备忘

配合 [sidebar-remote-opencli.md](./sidebar-remote-opencli.md)。

## 推荐进程布局（同机）

```text
cc-connect          :9810  Bridge（Chat）
opencli daemon      :19825 remote mode（Browser）
cursor / claude CLI        由 cc-connect 按 project 拉起
opencli CLI                在 Agent PATH 中，打 127.0.0.1:19825
```

## Agent 类型

| type（示例） | 说明 |
|--------------|------|
| `cursor` | Cursor Agent CLI |
| `claudecode` | Claude Code CLI |
| `pi`（预留） | Pi Agent — 需 cc-connect adapter，本仓库不实现本体 |

无人值守侧边栏建议开启 YOLO / force / bypassPermissions（按各 CLI 文档），避免卡在 allow/deny。

## Skills

在 Agent 用户家目录或 work_dir 安装 opencli skills，例如：

```bash
npx skills add jackwener/opencli --skill opencli-browser
```

并确保 `opencli` 在该 Unix 用户 PATH 中（若使用 cc-connect `run_as_user`，装到目标用户环境）。

## 环境变量（服务端）

```bash
export OPENCLI_REMOTE_TOKEN='...'
# export OPENCLI_DAEMON_BIND=0.0.0.0
```

Agent 子进程**不需要**额外远程 URL：传输对 CLI 透明。
