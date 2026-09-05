## ADDED Requirements

### Requirement: 侧边栏对话粘性绑定明确标签

系统 MUST 让侧边栏对话绑定到一个明确的用户标签，并在用户切换浏览器活动标签后保持原目标不变。

#### Scenario: 首次任务绑定当前标签

- **WHEN** 侧边栏尚未绑定目标，用户从可调试的 HTTP(S) 标签提交任务
- **THEN** 系统 MUST 捕获并绑定该标签的明确 tabId，再将任务交给 Agent
- **AND** 侧边栏 MUST 展示已绑定标签的标题或 URL

#### Scenario: 切换标签后继续操作原目标

- **GIVEN** 侧边栏已绑定标签 A
- **WHEN** 用户切换到标签 B，随后 Agent 继续执行该任务或用户发送后续消息
- **THEN** 所有侧边栏浏览器操作 MUST 继续作用于标签 A
- **AND** 系统 MUST NOT 因活动标签变为 B 而自动重新绑定

#### Scenario: 用户显式重新绑定

- **GIVEN** 侧边栏已绑定标签 A 且没有运行中的任务
- **WHEN** 用户在标签 B 上触发“重新绑定当前标签”
- **THEN** 系统 MUST 将目标切换为标签 B，并更新目标状态与 binding epoch

### Requirement: 绑定必须原子且不得使用候选标签兜底

系统 MUST 使用侧边栏捕获的一次性明确 tabId 完成绑定；后台不得在绑定期间重新查询活动标签或选择同窗口的其他可调试标签。

#### Scenario: 绑定期间快速切换标签

- **WHEN** 侧边栏捕获标签 A 的 tabId 后，用户在后台处理完成前切换到标签 B
- **THEN** 后台 MUST 只尝试绑定标签 A
- **AND** 不得将标签 B 或其他候选标签作为替代目标

#### Scenario: 当前标签不可调试

- **WHEN** 用户从 `chrome://`、扩展页面或其他不可调试页面请求绑定
- **THEN** 系统 MUST 返回结构化的不可绑定错误
- **AND** MUST NOT 静默绑定窗口中的其他 HTTP(S) 标签

### Requirement: 侧边栏执行策略禁止隐式新建标签

来自侧边栏 Agent project 的浏览器命令 MUST 使用固定 `sidebar` session 和 `bound-only` 目标策略。该策略 MUST 在 CLI/命令协议/扩展执行边界受到校验，不能只依赖 Agent 提示词。

#### Scenario: 有效绑定上执行页面操作

- **GIVEN** `sidebar` session 已绑定一个有效用户标签
- **WHEN** Agent 执行 state、click、type、select、navigate、screenshot 或 network 等受支持页面动作
- **THEN** 命令 MUST 作用于该 bound tabId
- **AND** MUST NOT 创建 OpenCLI owned tab

#### Scenario: Agent 使用错误 session

- **WHEN** 侧边栏 Agent 尝试使用非 `sidebar` browser session
- **THEN** 系统 MUST 覆盖为 `sidebar` 或以稳定错误码拒绝
- **AND** MUST NOT 为错误 session 创建 owned lease

#### Scenario: 无有效绑定时执行

- **WHEN** bound-only 命令到达但 `sidebar` 没有有效 bound lease
- **THEN** 系统 MUST 返回 `bound_target_required` 或等价稳定错误
- **AND** MUST NOT 调用新建标签或新建浏览器窗口路径

### Requirement: 目标失效必须失败关闭

系统 MUST 在绑定标签关闭、不可调试或不再属于预期浏览器上下文时标记目标失效，并要求用户显式重新绑定。

#### Scenario: 用户关闭绑定标签

- **GIVEN** 侧边栏绑定标签 A
- **WHEN** 用户关闭标签 A
- **THEN** 侧边栏目标状态 MUST 变为 BROKEN/失效
- **AND** 后续任务 MUST 被阻止或返回明确的重新绑定提示
- **AND** 系统 MUST NOT 自动创建替代标签

#### Scenario: 绑定标签手动导航

- **GIVEN** 侧边栏绑定标签 A
- **WHEN** 用户在标签 A 内导航到另一个可调试 HTTP(S) 页面
- **THEN** 系统 MUST 保持相同 tabId 的绑定并更新标题/URL

### Requirement: 运行中的任务锁定目标

系统 MUST 在侧边栏任务执行期间锁定其 tabId 与 binding epoch，避免重绑定导致执行跨标签漂移。

#### Scenario: BUSY 期间请求重新绑定

- **GIVEN** 当前侧边栏任务仍在运行
- **WHEN** 用户请求重新绑定或解除绑定
- **THEN** 系统 MUST 拒绝该操作并提示先停止当前任务，或先完成显式停止再执行重绑定
- **AND** 已运行命令的目标 MUST 保持不变

### Requirement: 侧边栏恢复后保持目标与最近对话状态

系统 MUST 将侧边栏目标、任务状态和有界的最近消息时间线托管在后台，并能在 Side Panel 页面重建后恢复展示。

#### Scenario: 切换标签导致 Side Panel 页面重建

- **GIVEN** 侧边栏已绑定目标并已有对话事件
- **WHEN** 浏览器冻结或销毁 Side Panel 页面，之后用户重新打开侧边栏
- **THEN** 侧边栏 MUST 恢复相同的目标状态、当前任务状态和有界的最近消息
- **AND** 不得因为 UI 重建而重新绑定当前活动标签

### Requirement: 保留非侧边栏 owned-session 行为

系统 MUST 将 bound-only 限制限定在侧边栏入口，不得全局移除 OpenCLI 的隔离标签能力。

#### Scenario: 普通 CLI 创建独立会话

- **WHEN** 用户从普通 CLI/软件入口执行未携带 bound-only 策略的 `opencli browser <session> open ...`
- **THEN** 系统 MUST 保持现有 owned lease 与隔离标签行为

### Requirement: 不兼容当前页模式的 Adapter 明确失败

需要 owned tab、tab mutation 或独立拦截页面的 Adapter MUST 在侧边栏 bound-only 模式下明确报告不兼容，而不是静默新开标签。

#### Scenario: Adapter 需要 owned tab

- **WHEN** 侧边栏 Agent 调用一个必须创建独立浏览器标签的 Adapter
- **THEN** 系统 MUST 返回 `adapter_requires_owned_tab` 或等价稳定错误
- **AND** 错误 MUST 指示用户改用普通 CLI/独立自动化工作流
- **AND** 系统 MUST NOT 在侧边栏任务中隐式创建标签
