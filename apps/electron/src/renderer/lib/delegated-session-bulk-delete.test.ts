import { describe, expect, test } from 'bun:test'
import {
  createDelegatedSessionBulkSelection,
  getSelectableDelegatedSessionIds,
  reconcileDelegatedSessionBulkSelection,
  selectAllDelegatedSessions,
  toggleDelegatedSessionBulkSelection,
  type DelegatedChildCandidate,
} from './delegated-session-bulk-delete'

function child(id: string, parentSessionId = 'parent-a'): DelegatedChildCandidate {
  return { id, parentSessionId, sourceDelegationId: `delegation-${id}` }
}

describe('委派子会话批量选择', () => {
  test('Given 混合父级和普通会话 When 进入模式 Then 只快照当前父级的直接委派子会话', () => {
    const selection = createDelegatedSessionBulkSelection('parent-a', [
      child('child-a'),
      child('child-b', 'parent-b'),
      { id: 'plain', parentSessionId: 'parent-a' },
      child('child-a'),
    ])

    expect(selection).toEqual({
      parentSessionId: 'parent-a',
      childOrder: ['child-a'],
      selectedIds: [],
    })
  })

  test('Given 可选与 Busy 子会话 When 全选 Then 只选择可删除项', () => {
    const selection = createDelegatedSessionBulkSelection('parent-a', [
      child('completed'),
      child('running'),
      child('blocked'),
    ])
    const busyIds = new Set(['running', 'blocked'])

    expect(getSelectableDelegatedSessionIds(selection, busyIds)).toEqual(['completed'])
    expect(selectAllDelegatedSessions(selection, busyIds).selectedIds).toEqual(['completed'])
    expect(toggleDelegatedSessionBulkSelection(selection, 'running', busyIds)).toBe(selection)
  })

  test('Given 已选项转为 Busy When 协调选择 Then 自动取消并保持其余选择', () => {
    const initial = selectAllDelegatedSessions(
      createDelegatedSessionBulkSelection('parent-a', [child('one'), child('two')]),
      new Set(),
    )

    const reconciled = reconcileDelegatedSessionBulkSelection(
      initial,
      [child('one'), child('two')],
      new Set(['two']),
    )

    expect(reconciled.selectedIds).toEqual(['one'])
  })

  test('Given 模式中出现新子会话 When 协调选择 Then 追加顺序但不自动选中', () => {
    const initial = selectAllDelegatedSessions(
      createDelegatedSessionBulkSelection('parent-a', [child('one'), child('two')]),
      new Set(),
    )

    const reconciled = reconcileDelegatedSessionBulkSelection(
      initial,
      [child('two'), child('three'), child('one')],
      new Set(),
    )

    expect(reconciled.childOrder).toEqual(['one', 'two', 'three'])
    expect(reconciled.selectedIds).toEqual(['one', 'two'])
  })

  test('Given 子会话消失 When 协调选择 Then 同时移除顺序和选择', () => {
    const initial = selectAllDelegatedSessions(
      createDelegatedSessionBulkSelection('parent-a', [child('one'), child('two')]),
      new Set(),
    )

    expect(reconcileDelegatedSessionBulkSelection(
      initial,
      [child('two')],
      new Set(),
    )).toEqual({
      parentSessionId: 'parent-a',
      childOrder: ['two'],
      selectedIds: ['two'],
    })
  })
})
