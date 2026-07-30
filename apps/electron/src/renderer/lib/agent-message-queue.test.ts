import { describe, expect, test } from 'bun:test'
import { parseQueuedMessageMentions } from './agent-message-queue'

describe('parseQueuedMessageMentions', () => {
  test('strips persisted display labels while preserving named reference ids', () => {
    const text = [
      '检查',
      `&todo:todo-123::${encodeURIComponent('输入框改造')}`,
      `&calendar_event:event-456::${encodeURIComponent('产品评审')}`,
      `&session:session-789::${encodeURIComponent('修复引用显示')}`,
    ].join(' ')

    expect(parseQueuedMessageMentions(text)).toEqual({
      cleanedText: '检查',
      mentionedSkills: [],
      mentionedMcpServers: [],
      mentionedSessionIds: ['session-789'],
      mentionedTodoIds: ['todo-123'],
      mentionedCalendarEventIds: ['event-456'],
    })
  })

  test('supports the early tilde format while messages are being migrated', () => {
    expect(parseQueuedMessageMentions('&todo:todo-123~1111 &session:session-789~2222')).toEqual({
      cleanedText: '',
      mentionedSkills: [],
      mentionedMcpServers: [],
      mentionedSessionIds: ['session-789'],
      mentionedTodoIds: ['todo-123'],
      mentionedCalendarEventIds: [],
    })
  })
})
