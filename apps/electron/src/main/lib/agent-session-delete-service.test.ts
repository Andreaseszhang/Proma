import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@proma/shared'
import {
  deleteDelegatedSessions,
  type AgentSessionDeleteDependencies,
} from './agent-session-delete-service'

function session(
  id: string,
  options: { parentSessionId?: string; delegated?: boolean } = {},
): AgentSessionMeta {
  return {
    id,
    title: id,
    workspaceId: 'workspace-a',
    createdAt: 1,
    updatedAt: 1,
    ...(options.parentSessionId ? { parentSessionId: options.parentSessionId } : {}),
    ...(options.delegated ? { sourceDelegationId: `delegation-${id}` } : {}),
  }
}

function dependencies(options: {
  sessions: AgentSessionMeta[]
  busyIds?: string[]
  busyAfterTeardownIds?: string[]
  busyWhenTornDown?: { targetId: string; triggerId: string }
  teardownFailureIds?: string[]
  cleanupFailureIds?: string[]
}) {
  const busyIds = new Set(options.busyIds ?? [])
  const busyAfterTeardownIds = new Set(options.busyAfterTeardownIds ?? [])
  const teardownFailureIds = new Set(options.teardownFailureIds ?? [])
  const cleanupFailureIds = new Set(options.cleanupFailureIds ?? [])
  const tornDown: string[] = []
  const deletedBatches: string[][] = []
  const cleaned: string[] = []

  const deps: AgentSessionDeleteDependencies = {
    listSessions: () => options.sessions,
    isBusy: (id) => busyIds.has(id)
      || (tornDown.includes(id) && busyAfterTeardownIds.has(id))
      || (options.busyWhenTornDown?.targetId === id && tornDown.includes(options.busyWhenTornDown.triggerId)),
    teardown: async (id) => {
      tornDown.push(id)
      if (teardownFailureIds.has(id)) throw new Error('teardown failed')
    },
    deleteRecords: (ids) => {
      deletedBatches.push([...ids])
      return {
        deleted: ids.map((id) => ({ session: options.sessions.find((item) => item.id === id)!, warnings: [] })),
        notFoundIds: [],
      }
    },
    afterDelete: (deletedSession) => {
      cleaned.push(deletedSession.id)
      if (cleanupFailureIds.has(deletedSession.id)) throw new Error('cleanup failed')
    },
  }

  return { deps, tornDown, deletedBatches, cleaned }
}

describe('委派子会话安全批量删除', () => {
  test('Given 混合合法性和 Busy 状态 When 删除 Then 只提交同父级且空闲的委派子会话', async () => {
    const fixture = dependencies({
      sessions: [
        session('eligible', { parentSessionId: 'parent-a', delegated: true }),
        session('busy', { parentSessionId: 'parent-a', delegated: true }),
        session('wrong-parent', { parentSessionId: 'parent-b', delegated: true }),
        session('plain', { parentSessionId: 'parent-a' }),
      ],
      busyIds: ['busy'],
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['eligible', 'busy', 'wrong-parent', 'plain', 'missing', 'eligible'],
    }, fixture.deps)

    expect(result.requestedIds).toEqual(['eligible', 'busy', 'wrong-parent', 'plain', 'missing'])
    expect(result.deletedIds).toEqual(['eligible'])
    expect(result.items.map((item) => [item.sessionId, item.code])).toEqual([
      ['eligible', 'deleted'],
      ['busy', 'busy'],
      ['wrong-parent', 'wrong_parent'],
      ['plain', 'not_delegated_child'],
      ['missing', 'not_found'],
    ])
    expect(fixture.tornDown).toEqual(['eligible'])
    expect(fixture.deletedBatches).toEqual([['eligible']])
    expect(fixture.cleaned).toEqual(['eligible'])
  })

  test('Given 子会话在 teardown 后转为 Busy When 提交 Then 拒绝且不删除记录', async () => {
    const fixture = dependencies({
      sessions: [session('changed', { parentSessionId: 'parent-a', delegated: true })],
      busyAfterTeardownIds: ['changed'],
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['changed'],
    }, fixture.deps)

    expect(result.items[0]?.code).toBe('busy')
    expect(fixture.deletedBatches).toEqual([])
  })

  test('Given 选中的直接子会话仍有委派后代 When 删除 Then 拒绝制造孤儿节点', async () => {
    const fixture = dependencies({
      sessions: [
        session('branch', { parentSessionId: 'parent-a', delegated: true }),
        session('grandchild', { parentSessionId: 'branch', delegated: true }),
      ],
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['branch'],
    }, fixture.deps)

    expect(result.items[0]?.code).toBe('failed')
    expect(result.items[0]?.message).toContain('委派后代')
    expect(fixture.tornDown).toEqual([])
    expect(fixture.deletedBatches).toEqual([])
  })

  test('Given 较早准备项在等待后续 teardown 时转为 Busy When 最终提交 Then 统一重检并保留该项', async () => {
    const fixture = dependencies({
      sessions: [
        session('earlier', { parentSessionId: 'parent-a', delegated: true }),
        session('later', { parentSessionId: 'parent-a', delegated: true }),
      ],
      busyWhenTornDown: { targetId: 'earlier', triggerId: 'later' },
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['earlier', 'later'],
    }, fixture.deps)

    expect(result.items.map((item) => [item.sessionId, item.code])).toEqual([
      ['earlier', 'busy'],
      ['later', 'deleted'],
    ])
    expect(fixture.deletedBatches).toEqual([['later']])
  })

  test('Given 单项 teardown 失败 When 删除 Then 其余合法项仍作为一个批次提交', async () => {
    const fixture = dependencies({
      sessions: [
        session('failed', { parentSessionId: 'parent-a', delegated: true }),
        session('deleted', { parentSessionId: 'parent-a', delegated: true }),
      ],
      teardownFailureIds: ['failed'],
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['failed', 'deleted'],
    }, fixture.deps)

    expect(result.deletedIds).toEqual(['deleted'])
    expect(result.items.map((item) => item.code)).toEqual(['failed', 'deleted'])
    expect(fixture.deletedBatches).toEqual([['deleted']])
  })

  test('Given metadata 已删除但运行时清理失败 When 返回 Then 仍标记 deleted 并附带 warning', async () => {
    const fixture = dependencies({
      sessions: [session('deleted', { parentSessionId: 'parent-a', delegated: true })],
      cleanupFailureIds: ['deleted'],
    })

    const result = await deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: ['deleted'],
    }, fixture.deps)

    expect(result.deletedIds).toEqual(['deleted'])
    expect(result.items[0]?.code).toBe('deleted')
    expect(result.items[0]?.warnings?.[0]).toContain('cleanup failed')
  })

  test('Given 请求为空或超过上限 When 删除 Then 整体拒绝且无副作用', async () => {
    const fixture = dependencies({ sessions: [] })

    await expect(deleteDelegatedSessions({ parentSessionId: 'parent-a', sessionIds: [] }, fixture.deps))
      .rejects.toThrow('至少选择一个子会话')
    await expect(deleteDelegatedSessions({
      parentSessionId: 'parent-a',
      sessionIds: Array.from({ length: 101 }, (_, index) => `child-${index}`),
    }, fixture.deps)).rejects.toThrow('单次最多删除 100 个子会话')
    expect(fixture.tornDown).toEqual([])
  })
})
