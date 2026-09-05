## Why

浏览器侧边栏已经成为 OpenCLI 的人机入口，但当前实现仍在每次发送前重新查询并绑定“当前活动标签”，而 Agent 只要使用了不同 browser session 或需要 owned tab 的 Adapter，就可能重新打开标签。用户期望的是更接近浏览器开发助手的体验：对话框固定在侧栏，一次选定目标页面后，切换到其他标签不改变 Agent 的操作目标，所有页面效果回到目标标签即可看到。

现有 `bound` tab lease 已具备“不拥有、不关闭、无空闲释放”的基础语义。本变更要把它提升为侧边栏入口的明确产品契约，并消除活动标签竞态、隐式回退和 Agent session 漂移。

## What Changes

- 侧边栏任务默认采用 **sticky bound-only** 模式：首次发送时原子绑定一个明确 tabId，后续消息持续操作该标签，不再每次发送时跟随当前活动标签。
- 侧边栏展示固定的目标标签状态（标题、URL、绑定/忙碌/失效），提供显式“绑定当前标签”“重新绑定”“解除绑定”操作。
- 绑定 API 接收并校验明确 tabId；活动标签不可调试、已关闭或不属于发起侧栏窗口时必须失败，不得选择同窗口内其他标签作为兜底。
- 目标标签失效时 **fail closed**：侧边栏任务不得静默切换标签、创建 OpenCLI owned tab 或覆盖其他用户页面。
- 侧边栏专用 Agent 环境固定 `browserSession=sidebar` 和 `targetPolicy=bound-only`；不能只依靠提示词要求模型记住 session。
- 浏览器依赖型 Adapter 若需要 owned tab、tab new/select/close 或无法使用当前绑定页，必须返回结构化“不兼容当前页模式”错误；纯 HTTP/只读 Adapter 可继续执行。
- 对话时间线与目标绑定状态由扩展后台托管并做有界恢复，使标签切换或 Side Panel 页面重建后仍能呈现当前任务与目标。
- 保留原有软件/CLI 主动发起的 owned-session 行为；非侧边栏工作流仍可创建隔离标签，本变更不全局禁止新标签。

## Capabilities

### New Capabilities

- `sticky-sidepanel-tab-targeting`: 侧边栏对话与明确用户标签的粘性绑定、目标状态展示、严格 bound-only 执行及失效保护。

### Modified Capabilities

- （无）本变更建立在已完成的 `sidebar-remote-opencli` 与 `multi-tenant-device-credentials` 变更之上；不改变它们的 Chat/Browser 双通道和设备路由协议。

## Impact

- **扩展侧栏**（`extension/sidepanel.js`、`sidepanel.html`）：目标标签控件、粘性绑定交互、任务期间重绑定限制、恢复后的状态渲染。
- **扩展后台**（`extension/src/background.ts`）：显式 tabId 绑定、目标状态机、会话/时间线恢复、bound-only 拒绝策略。
- **协议与 CLI**（`extension/src/protocol.ts`、`src/browser/`、`src/execution.ts`）：传递并执行 `targetPolicy=bound-only` 与默认 browser session，返回稳定错误码。
- **Agent 项目**：侧边栏专用 cc-connect project 注入 `OPENCLI_PROFILE`、`OPENCLI_BROWSER_SESSION=sidebar` 和 bound-only 策略；skills/包装入口遵守该约束。
- **兼容性**：普通 CLI owned sessions、local/remote 双模和多设备 profile 路由保持原行为。
- **非目标**：多目标并行侧栏、一条任务同时操作多个标签、自动接管用户新切换的标签、完全持久化无限聊天历史、取消 CLI 独立标签能力。
