## 1. 设备凭证登记与鉴权

- [x] 1.1 设计并实现设备登记存储（可配置路径的 JSON/YAML：deviceId、tokenHash、status）
- [x] 1.2 实现签发/吊销管理命令或脚本（生成 deviceToken、写入登记、吊销改状态）
- [x] 1.3 扩展 `remote-mode`：设备模式下从连接请求解析 deviceId + deviceToken 并校验登记表
- [x] 1.4 保留全局 `OPENCLI_REMOTE_TOKEN` 作为兼容/单租户开关，并在日志中标明当前模式
- [x] 1.5 为凭证校验与吊销后拒绝连接补充单元测试

## 2. 多连接路由（废除唯一活跃）

- [x] 2.1 设备模式下移除 `registerExtensionConnection` 的跨设备互踢逻辑
- [x] 2.2 实现同 deviceId 重复连接仅顶替本设备旧连接
- [x] 2.3 设备模式下收紧 `resolveProfileRoute`：无显式 contextId 一律失败（禁止单连接 fallback）
- [x] 2.4 更新可机读错误码/文案（目标离线、需要 profile、凭证拒绝）
- [x] 2.5 补充多连接并存与严格路由的单元测试

## 3. 扩展与侧边栏配置

- [x] 3.1 扩展配置增加 deviceId / deviceToken 字段（替代或并列于共享 remoteToken）
- [x] 3.2 出站 WS 使用设备凭证连接；hello.contextId 与配置 deviceId 对齐
- [x] 3.3 侧边栏 UI：设备凭证表单项与接线状态展示
- [x] 3.4 侧边栏 `session_key` / `user_id` 按 deviceId 生成，消除固定 `local:user`
- [x] 3.5 未配置 deviceId 时阻止宣称浏览器通道就绪并给出明确提示

## 4. Agent 设备绑定

- [x] 4.1 Spike：确认 cc-connect 是否支持按 session_key 注入 env / work_dir；记录结论
- [x] 4.2 实现绑定方案：会话注入 `OPENCLI_PROFILE=<deviceId>`，或 session 级包装脚本 / skill 强制 `--profile`
- [x] 4.3 文档化 Agent 侧「禁止无 profile 调用」约定，并验证缺省失败路径
- [x] 4.4 双设备并行冒烟：各自侧边栏任务只操作本机 Chrome

## 5. 文档与迁移

- [x] 5.1 新增或更新 docs：设备凭证签发、扩展配置、强制 `--profile`、与旧共享 token 模式对比
- [x] 5.2 标注 **BREAKING**：唯一活跃互踢废除；remote 多租户无 fallback
- [x] 5.3 迁移清单：从共享 token MVP 迁到设备模式的步骤与回滚说明
- [x] 5.4 更新 extension README 指向 docs（不把实现细节堆进根 README）
