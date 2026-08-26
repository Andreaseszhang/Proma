import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import {
  agentSessionIndicatorMapAtom,
  unviewedCompletedDelegationSessionIdsAtom,
} from './agent-atoms'

describe('委派子会话完成提示', () => {
  test('只将未查看的委派完成态映射为绿色 completed 指示，不写入顶层未读集合', () => {
    const store = createStore()
    store.set(unviewedCompletedDelegationSessionIdsAtom, new Set(['delegated-child']))

    expect(store.get(agentSessionIndicatorMapAtom).get('delegated-child')).toBe('completed')
  })

  test('查看后移除委派完成标记，状态恢复 idle', () => {
    const store = createStore()
    store.set(unviewedCompletedDelegationSessionIdsAtom, new Set(['delegated-child']))
    store.set(unviewedCompletedDelegationSessionIdsAtom, new Set())

    expect(store.get(agentSessionIndicatorMapAtom).get('delegated-child')).toBeUndefined()
  })
})
