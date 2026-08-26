import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@proma/shared'
import { getDelegatedChildSessionStatus } from './agent-session-list'

function delegatedChild(delegationStatus?: AgentSessionMeta['delegationStatus']): AgentSessionMeta {
  return {
    id: 'child-session',
    title: '子会话',
    parentSessionId: 'parent-session',
    sourceDelegationId: 'delegation-1',
    delegationStatus,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('getDelegatedChildSessionStatus', () => {
  test('only displays a completed marker while the completion is unviewed', () => {
    const child = delegatedChild('completed')
    expect(getDelegatedChildSessionStatus(child, new Map([[child.id, 'completed']]))).toBe('completed')
    expect(getDelegatedChildSessionStatus(child, new Map())).toBe('idle')
  })

  test('gives the live status precedence when a completed delegation is rerun or blocked', () => {
    const child = delegatedChild('completed')
    expect(getDelegatedChildSessionStatus(child, new Map([[child.id, 'running']]))).toBe('running')
    expect(getDelegatedChildSessionStatus(child, new Map([[child.id, 'blocked']]))).toBe('blocked')
  })

  test('leaves failed, cancelled, and interrupted delegations unaccented', () => {
    for (const delegationStatus of ['failed', 'cancelled', 'interrupted'] as const) {
      expect(getDelegatedChildSessionStatus(delegatedChild(delegationStatus), new Map())).toBe('idle')
    }
  })
})
