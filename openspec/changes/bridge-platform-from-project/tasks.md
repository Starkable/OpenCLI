## 1. 解析逻辑与后台注册

- [x] 1.1 在扩展配置/桥接模块中实现 `resolveBridgePlatform(config)`：`bridgeProject.trim() || 'opencli-sidebar'`
- [x] 1.2 修改 `extension/src/background.ts`：`register.platform` 使用解析结果，移除写死的 `AGENT_BRIDGE_PLATFORM` 常量用法
- [x] 1.3 确认 `agentBridgeConfigSignature` 在 Project 变更时触发重连（已含 `bridgeProject` 则复核；不足则补齐）
- [x] 1.4 为 platform 解析与 register 行为补充/更新单元测试（有 Project / 空 Project fallback）

## 2. 侧栏 session_key 对齐

- [x] 2.1 修改 `extension/sidepanel.js`：去掉固定 `PLATFORM = 'opencli-sidebar'`，`applySessionIdentity` 使用与后台一致的 platform 解析结果
- [x] 2.2 确认发送任务与 `/stop` 仍携带 `project: bridgeProject`，且 `session_key` 前缀与 platform 一致
- [x] 2.3 保存配置后的日志展示新的 `session_key`，便于排障

## 3. 文档与打包同步

- [x] 3.1 更新 `docs/guide/sidebar-remote-opencli.md` 中 `platform=opencli-sidebar` 的固定描述为「platform = Project 名」
- [x] 3.2 更新 `docs/guide/multi-tenant-device-credentials.md` 与 `docs/guide/opencli-device-credentials-deployment.zh-CN.md` 中的 `session_key` 示例
- [x] 3.3 构建扩展并同步 `extension-package` / `opencli-extension-package`（或等价发布产物），避免源码与安装包不一致
- [x] 3.4 在部署文档中注明：升级后旧 `session_key` 会话不自动续接（BREAKING 会话键）

## 4. 验证

- [x] 4.1 单人：Project=`opencli-sidebar` 时注册与发消息行为正常（兼容路径）
- [x] 4.2 双人：不同 Project + 不同 deviceId 同时「Agent Bridge：已连接」，互发消息互不顶替、回复回到各自侧栏
- [x] 4.3 故意两人填同一 Project：后连顶替先连（预期行为），确认日志可见同名 platform
