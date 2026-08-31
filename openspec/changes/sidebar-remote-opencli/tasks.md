## 1. 远程扩展接线（层 2）

- [x] 1.1 定义服务端远程接线协议（鉴权 token、连接注册、Command/Result 转发、心跳），尽量兼容现有 `extension/src/protocol.ts`
- [x] 1.2 实现服务端接线服务（独立模块或进程）：接受扩展出站连接、唯一活跃连接策略、命令路由
- [x] 1.3 扩展侧实现出站连接客户端（URL + token、重连、连接状态）
- [x] 1.4 将扩展现有 browser 动作执行路径接到远程下发的 Command，并回传 Result
- [x] 1.5 服务端 opencli 增加远程传输配置（替代本机 `localhost:19825`），打通至少一条 `browser` 命令端到端
- [x] 1.6 补充扩展离线 / 无连接时的可机读错误与基础日志

## 2. 侧边栏 Chat（层 1）

- [x] 2.1 扩展增加 Side Panel 页面与入口（manifest `side_panel`）
- [x] 2.2 实现 Bridge 客户端：连接 cc-connect Bridge（URL + token）、发送用户消息、订阅事件流
- [x] 2.3 侧边栏 UI：输入任务、展示流式文本/状态、停止、连接状态与错误提示
- [x] 2.4 配置持久化：Bridge URL、接线 URL、token（扩展 storage）

## 3. Agent 宿主与 opencli 集成

- [x] 3.1 编写服务端部署说明：cc-connect 项目配置、Bridge token、Cursor/Claude agent type、YOLO/auto
- [x] 3.2 在 Agent work_dir / 环境中安装 opencli 与 `opencli-browser` 等 skills，验证 Agent 可调用服务端 opencli
- [x] 3.3 确认 opencli 远程传输对 Agent 子进程透明（环境变量或配置）
- [x] 3.4 在设计中预留 Pi Agent 配置位（文档 + 配置示例，不实现 Pi 本体）

## 4. 默认绑定与体验加固

- [x] 4.1 明确并实现「当前 tab / bind」与侧边栏任务的默认关联规则
- [x] 4.2 侧边栏展示浏览器接线在线状态（与 Bridge Chat 状态区分）
- [x] 4.3 固定 MVP 多连接策略（唯一活跃）并写清用户可见错误文案

## 5. 验证与文档

- [x] 5.1 内网联调清单：仅装扩展 → 侧边栏任务 → Agent → opencli → 页面操作成功
- [x] 5.2 更新 docs（部署、token、端口、非目标/后置鉴权），避免写入根 README 臃肿内容（细节放 docs）
- [x] 5.3 记录回滚方式：关闭远程模式 / 恢复本机 daemon 路径（若保留双模开关）
