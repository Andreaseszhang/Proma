import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AgentWorkspace, Automation, CreateAutomationInput } from '@proma/shared'
import { validateToolArguments } from '@earendil-works/pi-ai/utils/validation'
import type { Tool } from '@earendil-works/pi-ai'
import type { PiBuiltinToolsContext } from './pi-builtin-tools'

// 本文件需单独进程运行：只替换业务边界，不访问用户配置、不启动 Agent 或调度器。
const initialWorkspaces: AgentWorkspace[] = [
  { id: 'a', name: 'A', slug: 'a', createdAt: 1, updatedAt: 1 },
  { id: 'b', name: 'B', slug: 'b', createdAt: 1, updatedAt: 1 },
]
let workspaces: AgentWorkspace[] = []
let automations: Automation[] = []
const listWorkspaces = mock(() => workspaces.map((workspace) => ({ ...workspace })))
const getWorkspace = mock((id: string) => workspaces.find((workspace) => workspace.id === id))
beforeEach(() => {
  workspaces = initialWorkspaces.map((workspace) => ({ ...workspace }))
  automations = []
  saved = undefined
  sourceAutomationId = undefined
  listWorkspaces.mockClear()
  getWorkspace.mockClear()
})
function automation(id: string, workspaceId?: string): Automation {
  return {
    id, workspaceId, name: id, prompt: '测试', active: true, scheduleType: 'daily',
    intervalMinutes: 10, timeOfDay: '09:00', channelId: 'channel-a',
    createdAt: 1, updatedAt: 1, nextRunAt: 2, runHistory: [],
  }
}
let saved: CreateAutomationInput | undefined
let sourceAutomationId: string | undefined
const noop = () => undefined
mock.module('../automation-manager', () => ({
  createAutomation: (input: CreateAutomationInput) => {
    saved = input
    return { ...input, id: 'task', createdAt: 1, updatedAt: 1, nextRunAt: 2, active: input.active ?? true, runHistory: [] } as Automation
  },
  deleteAutomation: noop,
  getAutomation: (id: string) => automations.find((item) => item.id === id),
  getEffectiveAutomationScheduleFields: (_input: unknown, existing: Automation) => existing,
  validateExplicitAutomationScheduleFields: noop,
  listAutomations: () => automations,
  updateAutomation: (input: { id: string; name?: string }) => {
    const existing = automations.find((item) => item.id === input.id)
    return existing ? { ...existing, name: input.name ?? existing.name } : undefined
  },
}))
mock.module('../automation-scheduler', () => ({ broadcastChanged: noop, runAutomationNow: noop }))
mock.module('../agent-session-manager', () => ({
  getAgentSessionMeta: () => ({ sourceAutomationId }), updateAgentSessionMeta: noop,
}))
mock.module('../agent-workspace-manager', () => ({
  getWorktreeRepos: () => [],
  getAgentWorkspace: getWorkspace,
  listAgentWorkspaces: listWorkspaces,
  listAgentWorkspacesWithProjectRootStatus: async () => workspaces,
}))
mock.module('../main-window-store', () => ({ getMainWindow: noop }))
mock.module('../git-diff-service', () => ({ getMainRepoRoot: noop, listWorktrees: noop }))
mock.module('../installer-downloader', () => ({ downloadInstaller: noop, launchInstaller: noop }))
mock.module('../installer-manifest', () => ({ fetchInstallerManifest: noop, findInstallerSource: noop }))
mock.module('../agent-collaboration-tools', () => ({ buildPiCollaborationTools: () => [] }))
mock.module('../vision-relay-service', () => ({
  getVisionRelayRouteLabel: noop, inspectImageWithVisionRelay: noop,
  isVisionRelayConfigured: () => false, isVisionRelayEligibleForModel: () => false,
}))
mock.module('../planning-manager', () => Object.fromEntries([
  'listTodos', 'getTodo', 'createTodo', 'updateTodo', 'deleteTodo', 'touchTodoSession',
  'listCalendarEvents', 'getCalendarEvent', 'createCalendarEvent', 'updateCalendarEvent', 'deleteCalendarEvent',
  'listPlanningGroups', 'createPlanningGroup', 'updatePlanningGroup', 'deletePlanningGroup',
  'listPlanningTags', 'createPlanningTag', 'updatePlanningTag', 'deletePlanningTag',
  'listActivePlanningReminders', 'getPlanningReminder', 'createPlanningReminder', 'updatePlanningReminder',
  'deletePlanningReminder', 'acknowledgePlanningReminder', 'snoozePlanningReminder',
].map((name) => [name, noop])))
mock.module('../planning-events', () => ({ broadcastPlanningAgentOperation: noop, broadcastPlanningChanged: noop }))
mock.module('../browser-controller', () => ({ browserController: { configureSession: noop } }))
mock.module('../terminal-service', () => Object.fromEntries([
  'closeAgentTerminal', 'executeAgentTerminal', 'interruptAgentTerminal', 'listAgentTerminals',
  'openAgentTerminal', 'readAgentTerminalOutput',
].map((name) => [name, noop])))
mock.module('../settings-service', () => ({ updateSettings: noop }))
mock.module('../vault-service', () => ({ getConfiguredVaultFileSystem: noop, getVaultConfig: noop }))

const { buildPiBuiltinTools } = await import('./pi-builtin-tools')
type Sdk = Parameters<typeof buildPiBuiltinTools>[0]
interface TestTool extends Tool {
  parameters: Tool['parameters'] & { properties: Record<string, unknown> }
  execute: (id: string, params: Record<string, unknown>) => Promise<{ details: Record<string, unknown> }>
}
const sdk = { defineTool: (tool: unknown) => tool } as unknown as Sdk
const context: PiBuiltinToolsContext = { sessionId: 'source-a', channelId: 'channel-a', modelId: 'model-a', workspaceId: 'a' }
async function tool(name: string, ctx = context) {
  const result = await buildPiBuiltinTools(sdk, ctx)
  const found = result.tools.find((item) => item.name === `mcp__automation__${name}`)
  if (!found) throw new Error(`工具未注册: ${name}`)
  return found as unknown as TestTool
}
const args = { name: 'B 日报', prompt: '在目标项目内生成日报', scheduleType: 'daily', timeOfDay: '09:00' }

describe('真实 Pi 工具创建入口（业务边界隔离）', () => {
  test('Given A 会话 When 创建到 B Then 仅归属变更，来源/渠道/模型不变且回显 B', async () => {
    const result = await (await tool('create_automation')).execute('call', { ...args, workspaceId: 'b' })
    expect(saved).toMatchObject({ workspaceId: 'b', channelId: 'channel-a', modelId: 'model-a', sourceSessionId: 'source-a', active: true })
    expect(result.details.automation).toMatchObject({ workspaceId: 'b', workspaceName: 'B', workspaceSlug: 'b' })
  })
  test('Given A 会话 When 不传目标 Then 创建到 A', async () => {
    await (await tool('create_automation')).execute('call', args)
    expect(saved?.workspaceId).toBe('a')
  })
  test('Given 目标删除 When 创建 Then 不调用持久化', async () => {
    saved = undefined
    await expect((await tool('create_automation')).execute('call', { ...args, workspaceId: 'deleted' })).rejects.toThrow('不存在')
    expect(saved).toBeUndefined()
  })
  test('Given 自动任务来源 When 指定 B Then 仍禁止递归创建', async () => {
    saved = undefined
    await expect((await tool('create_automation', { ...context, triggeredBy: 'automation' })).execute('call', { ...args, workspaceId: 'b' })).rejects.toThrow('禁止递归')
    sourceAutomationId = 'current-task'
    try {
      await expect((await tool('create_automation')).execute('call', { ...args, workspaceId: 'b' })).rejects.toThrow('禁止递归')
    } finally { sourceAutomationId = undefined }
    expect(saved).toBeUndefined()
  })
  test('Given 工作区发现 When 查询 Then 返回当前标记与精确 ID', async () => {
    const result = await (await tool('list_workspaces')).execute('call', {})
    expect(result.details.workspaces).toEqual([
      { id: 'a', name: 'A', slug: 'a', isCurrent: true, projectRootStatus: 'managed' },
      { id: 'b', name: 'B', slug: 'b', isCurrent: false, projectRootStatus: 'managed' },
    ])
  })
  test('Given 仅实现方案 A When 查看修改工具 Then 未暴露迁移参数', async () => {
    expect((await tool('update_automation')).parameters.properties).not.toHaveProperty('workspaceId')
  })
})


describe('定时任务摘要的请求级工作区索引', () => {
  test('Given 多任务、多工作区及失效归属 When 列表查询 Then 索引只读一次且不逐项 get', async () => {
    automations = [automation('a1', 'a'), automation('a2', 'a'), automation('b1', 'b'),
      automation('deleted', 'deleted'), automation('draft'), { ...automation('paused', 'b'), active: false }]
    const list = await tool('list_automations')
    const result = await list.execute('call', { active: true, includeHistory: true })
    expect(result.details.automations).toMatchObject([
      { id: 'a1', workspaceName: 'A', workspaceSlug: 'a', runHistory: [] },
      { id: 'a2', workspaceName: 'A', workspaceSlug: 'a', runHistory: [] },
      { id: 'b1', workspaceName: 'B', workspaceSlug: 'b', runHistory: [] },
      { id: 'deleted', workspaceId: 'deleted', workspaceName: undefined, workspaceSlug: undefined },
      { id: 'draft', workspaceId: undefined, workspaceName: undefined, workspaceSlug: undefined },
    ])
    expect(getWorkspace).not.toHaveBeenCalled()
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
  })
  test('Given 同一工具连续两次请求 When 工作区重命名和删除 Then 重新读取索引且不回退 get', async () => {
    automations = [automation('a1', 'a'), automation('b1', 'b')]
    const list = await tool('list_automations')
    const first = await list.execute('first', {})
    expect(first.details.automations).toMatchObject([{ workspaceName: 'A' }, { workspaceName: 'B' }])
    workspaces = [{ ...workspaces[0]!, name: 'A renamed', slug: 'a-renamed' }]
    const second = await list.execute('second', {})
    expect(second.details.automations).toMatchObject([
      { workspaceId: 'a', workspaceName: 'A renamed', workspaceSlug: 'a-renamed' },
      { workspaceId: 'b', workspaceName: undefined, workspaceSlug: undefined },
    ])
    expect((second.details.automations as Record<string, unknown>[])[0]).not.toHaveProperty('runHistory')
    expect(getWorkspace).not.toHaveBeenCalled()
    expect(listWorkspaces).toHaveBeenCalledTimes(2)
  })
  test.each([
    ['get_automation', 'b'], ['update_automation', 'b'],
    ['get_automation', 'deleted'], ['update_automation', 'deleted'],
  ])('Given 单项 %s 且归属 %s When 返回摘要 Then 保持查询或缺失语义', async (name, workspaceId) => {
    automations = [automation('task', workspaceId)]
    const result = await (await tool(name)).execute('call', { id: 'task', name: '新名称' })
    expect(result.details.automation).toMatchObject({
      workspaceId, workspaceName: workspaceId === 'b' ? 'B' : undefined,
      workspaceSlug: workspaceId === 'b' ? 'b' : undefined,
      name: name === 'update_automation' ? '新名称' : 'task',
      runHistory: [],
    })
    expect(getWorkspace).toHaveBeenCalledTimes(1)
    expect(listWorkspaces).not.toHaveBeenCalled()
  })
})

describe('Pi 0.85 实际 validator → 创建工具的传输层契约', () => {
  // 不复制 SDK normalizeOptionalNulls：可选 null 在 SDK 层被删除；
  // resolver 的直接调用仍拒绝 null，见 automation-workspace.test.ts。
  test.each([
    { label: '省略', input: {}, target: 'a', error: undefined },
    { label: 'null', input: { workspaceId: null }, target: 'a', error: undefined },
    { label: '显式 B', input: { workspaceId: 'b' }, target: 'b', error: undefined },
    { label: '空白', input: { workspaceId: '   ' }, target: undefined, error: '非空工作区 ID' },
    { label: '未知 ID', input: { workspaceId: 'unknown' }, target: undefined, error: '不存在' },
  ])('Given $label When 通过实际 SDK 校验再执行 Then 遵守目标契约', async ({ input, target, error }) => {
    const create = await tool('create_automation')
    const raw = { ...args, ...input }
    const validated: Record<string, unknown> = validateToolArguments(create, {
      type: 'toolCall', id: 'validated', name: create.name, arguments: raw,
    })
    if (target === 'a') expect(validated).not.toHaveProperty('workspaceId')
    else expect(validated.workspaceId).toBe(input.workspaceId)
    if (input.workspaceId === null) expect(raw.workspaceId).toBeNull()
    if (error) {
      await expect(create.execute('validated', validated)).rejects.toThrow(error)
      expect(saved).toBeUndefined()
    } else {
      const result = await create.execute('validated', validated)
      expect(saved?.workspaceId).toBe(target)
      expect(result.details.automation).toMatchObject({ workspaceId: target, workspaceName: target === 'a' ? 'A' : 'B' })
    }
  })
})
