import { beforeAll, describe, expect, mock, test } from 'bun:test'
import type { AgentSessionMeta, AgentThinkingLevel } from '@proma/shared'

const sessions = new Map<string, AgentSessionMeta>()
let nextSessionId = 1
let createAgentSessionCallCount = 0
let autoCompleteRuns = false
const runThinkingLevels: Array<AgentThinkingLevel | undefined> = []

mock.module('./agent-session-manager', () => ({
  createAgentSession: (title?: string, channelId?: string, workspaceId?: string, modelId?: string): AgentSessionMeta => {
    createAgentSessionCallCount++
    const now = Date.now()
    const session: AgentSessionMeta = {
      id: `child-${nextSessionId++}`,
      title: title ?? '新 Agent 会话',
      channelId,
      workspaceId,
      modelId,
      reasoningLevel: 'high',
      createdAt: now,
      updatedAt: now,
    }
    sessions.set(session.id, session)
    return session
  },
  getAgentSessionMeta: (id: string) => sessions.get(id),
  getAgentSessionSDKMessages: () => [],
  listAgentSessions: () => Array.from(sessions.values()),
  updateAgentSessionMeta: (id: string, updates: Partial<AgentSessionMeta>): AgentSessionMeta => {
    const current = sessions.get(id)
    if (!current) throw new Error(`Agent 会话不存在: ${id}`)
    const updated = { ...current, ...updates, updatedAt: Date.now() }
    sessions.set(id, updated)
    return updated
  },
}))

mock.module('./agent-headless-runner-registry', () => ({
  runRegisteredHeadlessAgent: async (
    input: { sessionId: string },
    callbacks: { onComplete: (messages: []) => void },
  ) => {
    runThinkingLevels.push(sessions.get(input.sessionId)?.reasoningLevel)
    if (autoCompleteRuns) callbacks.onComplete([])
  },
  stopRegisteredAgent: () => {},
}))

mock.module('./agent-model-selection', () => ({
  assertEnabledModelForChannel: ({ modelId }: { modelId?: string }) => modelId,
  listEnabledAgentModelsForChannel: (channelId: string) => ({
    channelId,
    channelName: '测试渠道',
    provider: 'openai-codex',
    models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
  }),
}))

type CollaborationToolsModule = typeof import('./agent-collaboration-tools')
let buildPiCollaborationTools: CollaborationToolsModule['buildPiCollaborationTools']

beforeAll(async () => {
  buildPiCollaborationTools = (await import('./agent-collaboration-tools')).buildPiCollaborationTools
})

interface TestTool {
  name: string
  execute: (toolCallId: string, params: unknown) => Promise<{ details: any }>
}

function buildTools(parentSessionId: string): TestTool[] {
  sessions.set(parentSessionId, {
    id: parentSessionId,
    title: parentSessionId,
    channelId: 'channel-1',
    workspaceId: 'workspace-1',
    reasoningLevel: 'medium',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  const sdk = {
    defineTool: (tool: TestTool) => tool,
  }
  return buildPiCollaborationTools(sdk as never, {
    sessionId: parentSessionId,
    channelId: 'channel-1',
    modelId: 'gpt-5.6-sol',
    workspaceId: 'workspace-1',
  }) as TestTool[]
}

function getTool(tools: TestTool[], name: string): TestTool {
  const tool = tools.find((item) => item.name === name)
  if (!tool) throw new Error(`缺少测试工具: ${name}`)
  return tool
}

async function createDelegation(
  tools: TestTool[],
  thinkingLevel?: AgentThinkingLevel,
): Promise<{ delegationId: string; childSessionId: string }> {
  const result = await getTool(tools, 'mcp__collaboration__delegate_agent').execute(
    `delegate-${nextSessionId}`,
    {
      title: '思考强度测试',
      task: '验证子会话思考强度',
      ...(thinkingLevel ? { thinkingLevel } : {}),
    },
  )
  return result.details.delegation
}

describe('Agent collaboration thinking level', () => {
  test('Given explicit thinking level When delegating Then persists it on the child session', async () => {
    const tools = buildTools('parent-explicit')

    const delegation = await createDelegation(tools, 'xhigh')

    expect(sessions.get(delegation.childSessionId)?.reasoningLevel).toBe('xhigh')
  })

  test('Given no thinking level When delegating Then keeps the new-session default', async () => {
    const tools = buildTools('parent-default')

    const delegation = await createDelegation(tools)

    expect(sessions.get(delegation.childSessionId)?.reasoningLevel).toBe('high')
  })

  test('Given an invalid thinking level When delegating Then rejects it before creating a child session', async () => {
    const tools = buildTools('parent-invalid')
    const sessionCountBefore = sessions.size

    await expect(getTool(tools, 'mcp__collaboration__delegate_agent').execute(
      'delegate-invalid-thinking',
      { title: '非法强度', task: '不应创建', thinkingLevel: 'extreme' },
    )).rejects.toThrow('无效的子会话思考强度')
    expect(sessions.size).toBe(sessionCountBefore)
  })

  test('Given a later batch item has an invalid thinking level When delegating Then creates no child sessions', async () => {
    const tools = buildTools('parent-invalid-batch')
    const callsBefore = createAgentSessionCallCount

    await expect(getTool(tools, 'mcp__collaboration__delegate_agents').execute(
      'delegate-invalid-batch-thinking',
      {
        items: [
          { title: '合法前置项', task: '本项也不应创建', thinkingLevel: 'low' },
          { title: '非法后置项', task: '整批应拒绝', thinkingLevel: 'extreme' },
        ],
      },
    )).rejects.toThrow('无效的子会话思考强度')
    expect(createAgentSessionCallCount).toBe(callsBefore)
  })

  test('Given batch items with different thinking levels When delegating Then persists each item independently', async () => {
    const tools = buildTools('parent-batch')

    const result = await getTool(tools, 'mcp__collaboration__delegate_agents').execute(
      'delegate-batch-thinking',
      {
        items: [
          { title: '轻量任务', task: '做快速检索', thinkingLevel: 'low' },
          { title: '深度任务', task: '做复杂审查', thinkingLevel: 'max' },
        ],
      },
    )

    const [first, second] = result.details.delegations
    expect(sessions.get(first.childSessionId)?.reasoningLevel).toBe('low')
    expect(sessions.get(second.childSessionId)?.reasoningLevel).toBe('max')
    expect(result.details.configuredThinkingLevels).toEqual([
      { delegationId: first.delegationId, thinkingLevel: 'low' },
      { delegationId: second.delegationId, thinkingLevel: 'max' },
    ])
  })

  test('Given an owned running delegation When parent changes thinking level Then next turn uses persisted value', async () => {
    const tools = buildTools('parent-update')
    const delegation = await createDelegation(tools, 'low')

    const result = await getTool(tools, 'mcp__collaboration__set_delegation_thinking_level').execute(
      'set-thinking',
      { delegationId: delegation.delegationId, thinkingLevel: 'max' },
    )

    expect(sessions.get(delegation.childSessionId)?.reasoningLevel).toBe('max')
    expect(result.details).toMatchObject({
      thinkingLevel: 'max',
      thinkingLevelSemantics: 'configured/requested',
      effectiveTiming: 'next_turn',
      status: 'running',
    })
  })

  test('Given a unique persisted delegation without parentSessionId When another parent changes it Then rejects mutation', async () => {
    const ownerTools = buildTools('parent-missing-owner')
    const delegation = await createDelegation(ownerTools, 'low')
    const child = sessions.get(delegation.childSessionId)
    if (!child) throw new Error('测试子会话不存在')
    sessions.set(child.id, { ...child, parentSessionId: undefined })
    const otherTools = buildTools('parent-missing-other')

    await expect(getTool(otherTools, 'mcp__collaboration__set_delegation_thinking_level').execute(
      'set-thinking-missing-parent',
      { delegationId: delegation.delegationId, thinkingLevel: 'max' },
    )).rejects.toThrow('未找到当前会话下的委派')
    expect(sessions.get(delegation.childSessionId)?.reasoningLevel).toBe('low')
  })

  test('Given a cancelled delegation with an updated configured level When continued Then the next run reads that level', async () => {
    const tools = buildTools('parent-continue')
    const delegation = await createDelegation(tools, 'low')
    await getTool(tools, 'mcp__collaboration__stop_delegation').execute(
      'stop-before-continue',
      { delegationId: delegation.delegationId },
    )
    await getTool(tools, 'mcp__collaboration__set_delegation_thinking_level').execute(
      'set-before-continue',
      { delegationId: delegation.delegationId, thinkingLevel: 'xhigh' },
    )

    autoCompleteRuns = true
    try {
      const runCountBefore = runThinkingLevels.length
      const result = await getTool(tools, 'mcp__collaboration__continue_delegation').execute(
        'continue-with-updated-thinking',
        { delegationId: delegation.delegationId, message: '继续执行' },
      )

      expect(runThinkingLevels.slice(runCountBefore)).toEqual(['xhigh'])
      expect(result.details.delegation).toMatchObject({
        status: 'completed',
        thinkingLevel: 'xhigh',
        thinkingLevelSemantics: 'configured/requested',
      })
    } finally {
      autoCompleteRuns = false
    }
  })

  test('Given another parent delegation When changing thinking level Then rejects cross-parent mutation', async () => {
    const ownerTools = buildTools('parent-owner')
    const otherTools = buildTools('parent-other')
    const delegation = await createDelegation(ownerTools, 'medium')

    await expect(getTool(otherTools, 'mcp__collaboration__set_delegation_thinking_level').execute(
      'set-thinking-other-parent',
      { delegationId: delegation.delegationId, thinkingLevel: 'high' },
    )).rejects.toThrow('未找到当前会话下的委派')
    expect(sessions.get(delegation.childSessionId)?.reasoningLevel).toBe('medium')
  })
})
