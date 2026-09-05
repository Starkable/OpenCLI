## 1. 目标状态与显式绑定协议

- [x] 1.1 定义 `SidebarTarget`、目标状态（UNBOUND/BOUND/BUSY/BROKEN）、`bindingEpoch` 与稳定错误码
- [x] 1.2 扩展 Side Panel → Background 消息协议，使绑定请求携带一次捕获的明确 `tabId + windowId`
- [x] 1.3 重构后台 bind 路径：只校验并绑定请求 tabId，移除活动标签二次查询与 fallback tab 选择
- [x] 1.4 将 sidebar target、当前 taskId 与 bindingEpoch 持久化到 `chrome.storage.session`，并在 Service Worker 启动时校验恢复
- [x] 1.5 监听 tab update/remove/window remove，保持目标 URL/title 或转入 BROKEN 状态

## 2. 粘性侧边栏交互

- [x] 2.1 在侧栏增加目标 chip，展示标题、URL、BOUND/BUSY/BROKEN 状态
- [x] 2.2 增加“绑定当前标签”“重新绑定”“解除绑定”操作与不可调试页面错误提示
- [x] 2.3 修改发送流程：仅在 UNBOUND 时绑定一次；BOUND 时直接复用，不再每条消息调用 `bindActiveTab`
- [x] 2.4 BUSY 期间锁定重绑定/解绑；停止或完成后恢复操作
- [x] 2.5 将用户消息、Agent 事件和任务状态写入后台有界时间线，并在 Side Panel 重建时回放
- [x] 2.6 多个 Side Panel 实例订阅同一设备目标快照，避免 UI 状态互相覆盖

## 3. bound-only 执行约束

- [x] 3.1 在 CLI/daemon Command 协议中增加可选 `targetPolicy=bound-only`，保持旧客户端缺省行为兼容
- [x] 3.2 支持侧栏 Agent project 的 `OPENCLI_BROWSER_SESSION=sidebar` 与 `OPENCLI_TARGET_POLICY=bound-only` 配置
- [x] 3.3 在命令规范化层固定/校验 sidebar session，防止 Agent 临时 session 名触发 owned lease
- [x] 3.4 在扩展 `resolveTab`/owned lease 创建边界执行 bound-only：无有效 bound lease 返回 `bound_target_required`，不得创建 tab/window
- [x] 3.5 保持 bound 页面上的 state/click/type/select/navigate/screenshot/network 等动作可用，并继续禁止 tab new/select/close 与窗口关闭
- [x] 3.6 更新侧栏专用 skill/包装入口，明确所有浏览器调用使用固定 session，并保留设备 `OPENCLI_PROFILE` 强制路由

## 4. Adapter 与兼容性

- [x] 4.1 识别 Browser/Cookie/Intercept/UI Adapter 对 tab lease 的需求，在执行上下文传播 targetPolicy
- [x] 4.2 对必须 owned tab 或 tab mutation 的 Adapter 返回 `adapter_requires_owned_tab`，禁止侧栏静默新开标签
- [x] 4.3 验证 PUBLIC/LOCAL/无需标签的 Adapter 在 bound-only 环境仍正常执行
- [x] 4.4 验证普通 local/remote CLI 未设置 bound-only 时仍能创建和复用 owned sessions
- [x] 4.5 验证 deviceId/OPENCLI_PROFILE 多设备路由与 sidebar browser session 两个维度不会混淆

## 5. 自动化验证

- [x] 5.1 单元测试：绑定 A 后切换活动页到 B，后续命令仍作用于 A
- [x] 5.2 单元测试：绑定请求与快速标签切换并发时只接受请求中的明确 tabId
- [x] 5.3 单元测试：不可调试、关闭、跨窗口目标 fail closed，且断言未调用 `chrome.tabs.create`
- [x] 5.4 单元测试：BUSY 期间拒绝重绑定；旧 bindingEpoch 的异步结果不能污染新目标
- [x] 5.5 单元测试：错误 session、无绑定和 owned-only Adapter 在 bound-only 下返回稳定错误
- [x] 5.6 回归测试：普通 CLI owned session 创建、复用、关闭行为保持不变
- [ ] 5.7 浏览器 E2E：侧栏发送长任务 → 切到其他标签 → Agent 操作原标签 → 切回查看结果，全程无新标签
- [ ] 5.8 恢复 E2E：Side Panel 页面销毁/重开后恢复目标、BUSY 状态和最近消息，不触发重新绑定

## 6. 文档、发布与回滚

- [x] 6.1 更新侧边栏部署文档，说明 sticky target、bound-only、设备 profile 与 session 的区别
- [x] 6.2 更新 Agent project 配置示例与不兼容 Adapter 的用户提示
- [x] 6.3 在扩展 UI/日志中记录绑定、重绑定、目标失效和拒绝新建标签的可诊断事件
- [ ] 6.4 构建并打包扩展，完成 local、shared-token remote、device-credentials remote 三种冒烟
- [x] 6.5 记录回滚开关/步骤：恢复旧 `preferBindActiveTab`，但不影响普通 CLI owned session
