## Context

当前侧栏在发送任务前调用 `bindActiveTab(session=sidebar)`。后台先查询一次活动标签，进入 `handleBind` 后又查询活动/候选标签；用户快速切换标签时存在绑定漂移。绑定完成后，扩展的 borrowed lease 能稳定指向原 tabId，但 Agent 若使用非 `sidebar` session，`resolveTab` 会走 owned lease 创建路径。部分 UI/INTERCEPT Adapter 也可能主动申请自动化标签。

上一变更已经把 cc-connect Bridge WebSocket 移到 Background Service Worker，解决了 Side Panel 页面被冻结或销毁导致的 Chat 掉线。本变更继续让后台成为“对话状态 + 浏览器目标”的事实来源。

## Goals / Non-Goals

**Goals:**

- 侧栏任务首次选定目标后，用户切换标签不改变执行目标。
- 侧栏入口不能隐式创建标签；目标不可用时可诊断地失败。
- 当前操作目标对用户始终可见，重新绑定必须显式发生。
- Agent/CLI 在工具边界强制使用 `sidebar` bound session，而非仅靠自然语言提示。
- 保留 OpenCLI 原有软件发起、隔离标签式自动化能力。

**Non-Goals:**

- 同一设备同时运行多个侧栏目标或多个并行 Agent 任务。
- 允许侧栏 Agent 管理 tab new/select/close。
- 让对话自动跟随用户每次切换的活动标签。
- 改写 cc-connect 核心或引入新的账号体系。
- 为所有现有 Adapter 立即提供当前页可视化版本。

## Architecture

```text
Chrome Window
┌─────────────────────────────────────────────────────────┐
│ Tab A: target page                  Fixed Side Panel     │
│ ┌──────────────────────────┐       ┌──────────────────┐ │
│ │ click/type/navigate      │◄──────│ conversation     │ │
│ │ boundTabId = 123         │       │ target chip      │ │
│ └──────────────────────────┘       └────────┬─────────┘ │
│ Tab B: user's other work                    │           │
└─────────────────────────────────────────────┼───────────┘
                                              │ Bridge
                                              ▼
                                     cc-connect Agent
                                     profile=<deviceId>
                                     session=sidebar
                                     policy=bound-only
                                              │
                                              ▼
                                     opencli daemon
                                              │ explicit route
                                              ▼
                                     extension background
                                     lease(sidebar) → tab 123
```

## State Model

后台按当前设备的侧栏会话维护一个 `SidebarTarget`：

```text
UNBOUND
   │ bind exact active tab
   ▼
BOUND(tabId, windowId, url, title, bindingEpoch)
   │ send task
   ▼
BUSY(same tabId, taskId)
   │ task completes/stops
   ▼
BOUND

BOUND/BUSY ── tab closed or non-debuggable ──► BROKEN
BROKEN ── explicit rebind ──► BOUND(new tabId, epoch+1)
BOUND ── explicit unbind ──► UNBOUND
```

`bindingEpoch` 防止异步结果更新到已经重绑定的新目标。BUSY 期间禁止普通重绑定/解绑；用户必须先停止当前任务，避免 Agent 执行过程中目标被替换。

## Decisions

### D1：侧栏使用粘性绑定，不使用每次发送自动跟随

- **决定**：未绑定时，首次发送可提示并绑定当前标签；绑定成功后所有后续消息复用该 tabId。切换浏览器活动标签不改变绑定。
- **原因**：对话上下文与页面状态天然连续；避免用户切去查资料后一次追问误操作另一个页面。
- **备选**：每次发送绑定当前活动标签——操作简单，但目标会随 UI 焦点漂移，不符合“对应页面”的稳定心智。

### D2：显式 tabId 的原子绑定

- **决定**：侧栏在所属 Chrome 窗口中捕获一次 `{tabId, windowId}`，后台绑定接口只验证并绑定该 tabId，不再二次查询活动标签，也不从其他可调试标签中兜底。
- **原因**：消除两次异步查询间的切换竞态，并防止在 `chrome://` 页面上发送时误绑同窗口中的任意 HTTP 页面。
- **失败语义**：返回 `bound_tab_not_found`、`bound_tab_not_debuggable`、`bound_tab_window_mismatch` 等稳定错误码。

### D3：后台是目标与时间线的事实来源

- **决定**：目标状态、当前 taskId、bindingEpoch 和有界消息时间线保存在 Background Service Worker，并同步到 `chrome.storage.session`；Side Panel 只渲染快照和发送意图。
- **原因**：标签切换、侧栏重建和 Service Worker 唤醒不应改变会话目标或丢失最近交互。
- **边界**：时间线采用数量/体积上限，不替代 cc-connect 的长期会话存储。

### D4：侧栏入口严格 bound-only，CLI 入口保持 owned 能力

- **决定**：侧栏专用 cc-connect project 设置：

  ```text
  OPENCLI_PROFILE=<deviceId>
  OPENCLI_BROWSER_SESSION=sidebar
  OPENCLI_TARGET_POLICY=bound-only
  ```

  CLI/执行协议将目标策略传到扩展。`bound-only` 下若不存在有效 bound lease，任何会创建 owned lease 的路径必须返回 `bound_target_required`，不得调用 `chrome.tabs.create`。
- **原因**：session 名只写在提示词中无法形成安全保证；在执行边界失败才能彻底避免偶发新标签。
- **兼容性**：没有 `bound-only` 的普通 CLI 命令沿用现有 owned session 行为。

### D5：侧栏浏览器 session 固定为 `sidebar`

- **决定**：本期遵循“一人一设备、一个侧栏目标”，browser session 固定为 `sidebar`；Agent 包装入口覆盖或拒绝不同 session，而不是接受模型临时生成的名字。
- **原因**：与现有绑定和部署文档一致，避免本期引入多目标路由。
- **后续**：若需要多窗口/多对话并行，可扩展为 `sidebar:<conversationId>`，另开变更处理 cc-connect per-session 环境问题。

### D6：Adapter 按是否需要浏览器标签分类处理

- **决定**：PUBLIC/LOCAL 或不需要页面租约的只读 Adapter 可继续执行；需要 owned tab、tab mutation 或独立拦截页的 Adapter 在 bound-only 模式返回 `adapter_requires_owned_tab`，并说明需改用普通 CLI 工作流。
- **原因**：不能用“后台其实没有开标签”冒充页面可视化，也不能为满足 Adapter 静默破坏侧栏契约。
- **非决定**：本变更不要求一次性重写全部 Adapter 以支持绑定页。

### D7：目标页面导航允许，标签生命周期操作禁止

- **决定**：在明确绑定后允许 state/click/type/select/navigation/screenshot/network 等作用于同一 tabId；继续禁止 tab new/select/close 和关闭窗口。
- **原因**：用户授权的是“让 Agent 操作这个页面”，包括站内/跨 URL 导航，但没有授权管理其他标签或销毁用户资源。

## Failure and Recovery Semantics

| 情况 | 行为 |
|---|---|
| 用户切换到其他标签 | 继续操作原 bound tab；UI target chip 不变 |
| 用户手动导航 bound tab | 更新 URL/title，保持同 tabId 绑定 |
| 用户关闭 bound tab | 状态变为 BROKEN；后续命令失败，不新建标签 |
| bound tab 变成 `chrome://` 等不可调试页面 | 状态变为 BROKEN；提示重新绑定 HTTP(S) 页面 |
| Agent 使用非 sidebar session | 包装/执行策略拒绝，不创建 owned lease |
| BUSY 时请求重新绑定 | 拒绝并提示先停止任务 |
| Side Panel 被销毁后重开 | 从后台/session storage 恢复目标、任务和最近消息 |
| 浏览器整体退出 | 浏览器会话结束；下次启动要求校验或重新绑定 |

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 用户与 Agent 同时修改同一页面产生竞争 | BUSY 状态显著展示；重绑定需先停止；重要写操作仍遵循确认/验证规则 |
| 某些 CDP 动作在后台标签受浏览器限制 | 返回明确错误；必要时提示用户切回目标标签，不自动抢焦点 |
| Agent 绕过 skill 直接调用 raw opencli | project 环境的 `targetPolicy=bound-only` 在 CLI/扩展执行边界再次校验 |
| Adapter 体验下降 | 结构化说明“不支持当前页模式”；普通 CLI owned workflow 仍可用 |
| storage.session 时间线占用配额 | 有界条数与字节数，超限淘汰最旧事件 |
| 多窗口侧栏同时打开造成控制冲突 | 本期同设备共享一个目标与 BUSY 状态；所有侧栏实例展示同一后台快照 |

## Migration Plan

1. 增加目标状态与显式绑定协议，同时兼容旧 `bindActiveTab` 调用。
2. 侧栏切换到 sticky UI；首次无目标时绑定，后续不重复绑定。
3. 为侧栏 Agent project 配置固定 session 和 bound-only policy，并在命令协议执行端强制。
4. 增加失效、竞态、快速切换和“不调用 tabs.create”的自动化测试。
5. 发布扩展与服务端 CLI；先在单设备环境验证，再验证多设备 profile 隔离。
6. 稳定后弃用侧栏使用的旧“每次发送绑定当前活动标签”路径。

回滚时可恢复旧侧栏 UI 与 `preferBindActiveTab` 行为；协议字段保持可选，普通 CLI 路径不受影响。

## Open Questions

- cc-connect 当前 Agent adapter 是否能够稳定继承 project 级 `OPENCLI_BROWSER_SESSION` 与 `OPENCLI_TARGET_POLICY`；若某运行时会清理环境，需要使用同等强制力的包装入口。
- 首次发送在未绑定时应自动绑定并发送，还是先展示目标预览要求用户再次确认；建议先采用“一次点击自动绑定并显示”，写操作仍遵循既有确认策略。
- 最近消息时间线的合理上限是按 200 条、按字节，还是两者同时限制；建议同时限制。
