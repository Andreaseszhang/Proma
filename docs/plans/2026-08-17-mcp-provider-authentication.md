# Proma MCP Provider Authentication Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为钉钉、企业微信、腾讯会议、企查查、Notion、GitHub、QQ 邮箱和东方财富妙想 MCP 增加按服务认证方式分流的连接目录，并以 Notion 作为标准 OAuth 回调的首个真实实现。

**Architecture:** 保留现有工作区 `mcp.json` 作为非敏感 MCP transport 模板的存储。新增 provider action 元数据，将连接动作分为标准 MCP OAuth、API Key 官方页面、企业应用配置和 Agent 引导四类；敏感 token 只进入安全凭据存储，复杂配置通过已有 Agent 会话入口生成自包含提示词。

**Tech Stack:** Electron main/preload, React 18, Jotai, TypeScript, MCP Streamable HTTP, OAuth 2.1 + PKCE, Bun/Vitest-compatible tests.

---

### Task 1: 固化九项服务的 provider manifest

**Files:**
- Modify: `apps/electron/src/renderer/components/agent-skills/integration-catalog.ts`
- Test: `apps/electron/src/renderer/components/agent-skills/integration-catalog.test.ts`

**Steps:**
1. 为每个服务补齐 display metadata、MCP transport/template、setup URL、auth strategy 和复杂配置说明。
2. 将 Notion 标为标准 OAuth；将 GitHub/QQ 邮箱等 API Key 型服务指向官方凭据页；将企业微信、钉钉、腾讯会议、企查查及东方财富妙想标为 provider-specific 或 API Key/Agent guided。
3. 测试每个 provider 的 action 分类、唯一 id、非敏感模板和官方入口。
4. Run: `bun test apps/electron/src/renderer/components/agent-skills/integration-catalog.test.ts`

### Task 2: 添加 OAuth callback 主进程服务

**Files:**
- Create: `apps/electron/src/main/lib/mcp-oauth-service.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Test: `apps/electron/src/main/lib/mcp-oauth-service.test.ts`

**Steps:**
1. 实现 loopback listener、state、PKCE、OAuth metadata discovery、authorization code exchange 和取消/超时。
2. 只接受本机 loopback 回调，校验 state，禁止把 code/token 写入日志或工作区 JSON。
3. 通过现有安全凭据服务保存 refresh/access token，并为 MCP 请求暴露短生命周期 header。
4. 增加 IPC/preload 类型，renderer 能开始/取消 OAuth 并订阅结果。
5. 先用 provider-agnostic 测试覆盖成功回调、state 不匹配、超时和 token 刷新。
6. Run: `bun test apps/electron/src/main/lib/mcp-oauth-service.test.ts`。

### Task 3: 接入 Notion OAuth 与 MCP transport

**Files:**
- Modify: `apps/electron/src/main/lib/adapters/pi-mcp-tools.ts`
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts`
- Modify: `apps/electron/src/renderer/components/agent-skills/IntegrationCatalog.tsx`
- Test: `apps/electron/src/main/lib/mcp-oauth-service.test.ts`

**Steps:**
1. 从 Notion MCP protected-resource metadata 发现授权服务器和 scope。
2. 点击安装后写入非敏感 remote MCP URL，启动 PKCE 浏览器授权。
3. 回调成功后保存凭据，MCP connection 使用 Bearer header，失败时显示重新授权状态。
4. 保留手动 MCP 表单作为 fallback，不覆盖用户已有配置。
5. Run: `bun test apps/electron/src/main/lib/mcp-oauth-service.test.ts`。

### Task 4: 接入 API Key 和复杂配置引导

**Files:**
- Modify: `apps/electron/src/renderer/components/agent-skills/integration-catalog.ts`
- Modify: `apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx`
- Modify: `apps/electron/src/renderer/components/agent-skills/IntegrationCatalog.tsx`
- Test: `apps/electron/src/renderer/components/agent-skills/integration-catalog.test.ts`

**Steps:**
1. API Key 型服务点击后打开官方 key 页面，并回到 Proma 的 provider-specific 配置入口。
2. 企业微信、钉钉、腾讯会议、企查查等复杂配置生成自包含 Agent prompt，创建 Agent 会话处理应用凭据、权限和 MCP 模板。
3. 东方财富妙想走 Skills/API Key 页面，不误标成 OAuth。
4. CLI/Agent/API Key/OAuth 的状态文案和按钮行为保持可区分。
5. Run: `bun test apps/electron/src/renderer/components/agent-skills/integration-catalog.test.ts`。

### Task 5: 全量验证与版本更新

**Files:**
- Modify: `apps/electron/package.json`
- Modify: `packages/shared/package.json` if shared IPC types changed

**Steps:**
1. 递增受影响包 patch 版本。
2. Run: `bun run --filter='@proma/electron' typecheck`。
3. Run: `bun run --filter='@proma/electron' build:renderer`。
4. Run: `git diff --check`。
5. Review that secrets, authorization codes and refresh tokens are absent from `mcp.json` and logs.
