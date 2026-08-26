import { describe, expect, test } from 'bun:test'
import { dismissCompletedDelegationSession, getAgentCompletionMarkers, isAgentSessionActiveForCompletion, isDelegatedSessionActiveForCompletion } from './agent-completion-presence'
import type { TabItem } from '@/atoms/tab-atoms'

describe('委派子会话完成状态清除', () => {
  test('Given 子会话存在未查看完成标记 When 用户打开该子会话 Then 只清除该子会话标记', () => {
    const result = dismissCompletedDelegationSession(new Set(['child', 'other-child']), 'child')

    expect([...result]).toEqual(['other-child'])
  })

  test('Given 子会话没有未查看完成标记 When 尝试清除 Then 集合内容保持不变', () => {
    const result = dismissCompletedDelegationSession(new Set(['other-child']), 'child')

    expect([...result]).toEqual(['other-child'])
  })
})

describe('委派子会话完成归属判断', () => {
  test('Given 当前父会话右侧正在查看该子会话 When 子会话完成 Then 不标记为未查看', () => {
    expect(isDelegatedSessionActiveForCompletion({
      activeSessionId: 'parent',
      activeDelegationSessionId: 'child',
      parentSessionId: 'parent',
      sessionId: 'child',
      documentHasFocus: true,
    })).toBe(true)
  })

  test('Given 当前父会话右侧查看的是另一个子会话 When 子会话完成 Then 标记为未查看', () => {
    expect(isDelegatedSessionActiveForCompletion({
      activeSessionId: 'parent',
      activeDelegationSessionId: 'other-child',
      parentSessionId: 'parent',
      sessionId: 'child',
      documentHasFocus: true,
    })).toBe(false)
  })

  test('Given 当前打开的是其他父会话 When 子会话完成 Then 不视为正在查看', () => {
    expect(isDelegatedSessionActiveForCompletion({
      activeSessionId: 'other-parent',
      activeDelegationSessionId: 'child',
      parentSessionId: 'parent',
      sessionId: 'child',
      documentHasFocus: true,
    })).toBe(false)
  })
})

describe('Agent 完成归属判断', () => {
  test('Given 当前激活的是同一个 Agent Tab When Agent 完成 Then 视为用户仍在查看', () => {
    const tabs: TabItem[] = [
      { id: '__scratch-pad__', type: 'scratch', sessionId: '__scratch-pad__', title: '草稿' },
      { id: 'agent-1', type: 'agent', sessionId: 'agent-1', title: '当前任务' },
    ]
    const input = {
      tabs,
      activeTabId: 'agent-1',
      currentAgentSessionId: 'agent-1',
      sessionId: 'agent-1',
      documentHasFocus: true,
    }

    expect(isAgentSessionActiveForCompletion(input)).toBe(true)
    expect(getAgentCompletionMarkers(input)).toEqual({
      markUnviewedCompleted: false,
    })
  })

  test('Given 当前激活的是草稿页 When 旧 Agent 完成 Then 视为后台完成', () => {
    const tabs: TabItem[] = [
      { id: '__scratch-pad__', type: 'scratch', sessionId: '__scratch-pad__', title: '草稿' },
      { id: 'agent-1', type: 'agent', sessionId: 'agent-1', title: '后台任务' },
    ]
    const input = {
      tabs,
      activeTabId: '__scratch-pad__',
      currentAgentSessionId: 'agent-1',
      sessionId: 'agent-1',
      documentHasFocus: true,
    }

    expect(isAgentSessionActiveForCompletion(input)).toBe(false)
    expect(getAgentCompletionMarkers(input)).toEqual({
      markUnviewedCompleted: true,
    })
  })

  test('Given Tab 状态尚未恢复但 currentAgentSessionId 匹配 When Agent 完成 Then 使用兼容判断', () => {
    expect(isAgentSessionActiveForCompletion({
      tabs: [],
      activeTabId: null,
      currentAgentSessionId: 'agent-1',
      sessionId: 'agent-1',
      documentHasFocus: true,
    })).toBe(true)
  })

  test('Given 当前激活的就是该 Agent Tab 但窗口在后台 When Agent 完成 Then 视为未查看并入账角标', () => {
    const tabs: TabItem[] = [
      { id: '__scratch-pad__', type: 'scratch', sessionId: '__scratch-pad__', title: '草稿' },
      { id: 'agent-1', type: 'agent', sessionId: 'agent-1', title: '当前任务' },
    ]
    const input = {
      tabs,
      activeTabId: 'agent-1',
      currentAgentSessionId: 'agent-1',
      sessionId: 'agent-1',
      documentHasFocus: false,
    }

    expect(isAgentSessionActiveForCompletion(input)).toBe(false)
    expect(getAgentCompletionMarkers(input)).toEqual({
      markUnviewedCompleted: true,
    })
  })
})
