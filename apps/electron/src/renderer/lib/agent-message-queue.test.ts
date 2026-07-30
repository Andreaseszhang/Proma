import { describe, expect, test } from 'bun:test'
import {
  getQueuedMessageDisplayParts,
  parseQueuedMessageMentions,
} from './agent-message-queue'

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

  test('uses named planning references for queue preview without changing the send protocol', () => {
    expect(getQueuedMessageDisplayParts([
      '请处理',
      `&todo:todo-123::${encodeURIComponent('输入框改造')}`,
      '并准备',
      `&calendar_event:event-456::${encodeURIComponent('产品评审')}`,
    ].join(' '))).toEqual([
      { type: 'text', value: '请处理 ' },
      { type: 'reference', referenceType: 'todo', id: 'todo-123', label: '输入框改造' },
      { type: 'text', value: ' 并准备 ' },
      { type: 'reference', referenceType: 'calendar_event', id: 'event-456', label: '产品评审' },
    ])
  })

  test('uses semantic chips for file, Skill, MCP, and session references', () => {
    expect(getQueuedMessageDisplayParts([
      '@file:notes/brief.md',
      '/skill:brainstorming',
      '#mcp:playwright',
      `&session:session-789::${encodeURIComponent('修复引用显示')}`,
    ].join(' '))).toEqual([
      { type: 'reference', referenceType: 'file', id: 'notes/brief.md', label: 'brief.md' },
      { type: 'text', value: ' ' },
      { type: 'reference', referenceType: 'skill', id: 'brainstorming', label: 'brainstorming' },
      { type: 'text', value: ' ' },
      { type: 'reference', referenceType: 'mcp', id: 'playwright', label: 'playwright' },
      { type: 'text', value: ' ' },
      { type: 'reference', referenceType: 'session', id: 'session-789', label: '修复引用显示' },
    ])
  })

  test('falls back to a compact reference label when legacy messages have no title', () => {
    expect(getQueuedMessageDisplayParts('&todo:todo-123')).toEqual([
      { type: 'reference', referenceType: 'todo', id: 'todo-123', label: 'Todo todo-123' },
    ])
  })
})
