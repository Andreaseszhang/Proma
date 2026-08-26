import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta, AgentWorkspace, ConversationMeta } from '@proma/shared'
import { buildTabSwitcherModel } from './tab-switcher-model'

const agentSession: AgentSessionMeta = {
  id: 'agent-1',
  title: 'Agent 会话',
  channelId: 'channel-1',
  workspaceId: 'workspace-1',
  createdAt: 1,
  updatedAt: 3,
}

const workspace: AgentWorkspace = {
  id: 'workspace-1',
  name: '默认项目',
  slug: 'default',
  createdAt: 1,
  updatedAt: 1,
}

const conversation: ConversationMeta = {
  id: 'chat-1',
  title: 'Chat 对话',
  createdAt: 1,
  updatedAt: 2,
}

describe('Ctrl+Tab 会话候选', () => {
  test('Given Chat 和 Agent 会话 When 构建切换候选 Then 只包含会话且不包含已删除的 Scratch Pad', () => {
    const model = buildTabSwitcherModel({
      activeSessionId: agentSession.id,
      agentIndicatorMap: new Map(),
      agentSessions: [agentSession],
      agentWorkspaces: [workspace],
      conversations: [conversation],
      draftSessionIds: new Set(),
      streamingConversationIds: new Set(),
      tabMru: [agentSession.id, conversation.id],
      unviewedCompletedIds: new Set(),
    })

    expect(model.candidates.map((candidate) => candidate.id)).toEqual([agentSession.id, conversation.id])
    expect(model.candidates.map((candidate) => candidate.type)).toEqual(['agent', 'chat'])
    expect(model.candidates.some((candidate) => candidate.id === '__scratch-pad__')).toBeFalse()
  })
})
