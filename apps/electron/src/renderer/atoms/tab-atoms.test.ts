import { describe, expect, test } from 'bun:test'
import {
  getPersistableTabState,
  openTab,
  type TabItem,
} from './tab-atoms'

function createAgentTab(id = 'agent-1'): TabItem {
  return { id, type: 'agent', sessionId: id, title: 'Agent 会话' }
}

describe('会话 Tab registry', () => {
  test('Given 打开另一会话 When registry 切换 Then 只保留目标会话且不会创建 Scratch Pad', () => {
    const result = openTab([createAgentTab()], {
      type: 'chat',
      sessionId: 'chat-1',
      title: 'Chat 会话',
    })

    expect(result.activeTabId).toBe('chat-1')
    expect(result.tabs).toEqual([
      { id: 'chat-1', type: 'chat', sessionId: 'chat-1', title: 'Chat 会话' },
    ])
    expect(result.tabs.some((tab) => tab.id === '__scratch-pad__')).toBeFalse()
  })

  test('Given 旧持久化状态含 Scratch Pad When 保存当前 registry Then 不再暴露旧入口', () => {
    const staleTabs = [
      { id: '__scratch-pad__', type: 'scratch', sessionId: '__scratch-pad__', title: 'Scratch Pad' },
      createAgentTab(),
    ] as unknown as TabItem[]

    expect(getPersistableTabState(staleTabs, '__scratch-pad__')).toEqual({
      tabs: [createAgentTab()],
      activeTabId: null,
    })
  })
})
