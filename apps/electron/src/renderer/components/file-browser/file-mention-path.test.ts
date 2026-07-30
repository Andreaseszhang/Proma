import { describe, expect, test } from 'bun:test'
import { resolveFileMentionPath } from './file-mention-path'

describe('resolveFileMentionPath', () => {
  test('makes a relative session file path unambiguous', () => {
    expect(resolveFileMentionPath(
      { source: 'session', path: 'notes/brief.md' },
      '/Users/example/.proma/agent-sessions/session-1',
    )).toBe('/Users/example/.proma/agent-sessions/session-1/notes/brief.md')
  })

  test('keeps project and absolute session paths unchanged', () => {
    expect(resolveFileMentionPath(
      { source: 'workspace', path: '/Users/example/project/brief.md' },
      '/Users/example/.proma/agent-sessions/session-1',
    )).toBe('/Users/example/project/brief.md')
    expect(resolveFileMentionPath(
      { source: 'session', path: '/tmp/attached.md' },
      '/Users/example/.proma/agent-sessions/session-1',
    )).toBe('/tmp/attached.md')
  })

  test('uses Windows separators for a Windows session root', () => {
    expect(resolveFileMentionPath(
      { source: 'session', path: 'notes/brief.md' },
      'C:\\Users\\example\\.proma\\agent-sessions\\session-1',
    )).toBe('C:\\Users\\example\\.proma\\agent-sessions\\session-1\\notes\\brief.md')
  })
})
