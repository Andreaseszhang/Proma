import { describe, expect, test } from 'bun:test'
import { resolveScratchPadExportWorkspaceId } from './scratch-pad-export-context'

describe('ScratchPad export workspace', () => {
  test('uses the active Agent session project instead of the globally selected project', () => {
    expect(resolveScratchPadExportWorkspaceId(
      'session-in-project-b',
      [{ id: 'session-in-project-b', workspaceId: 'project-b' }],
      'project-a',
    )).toBe('project-b')
  })

  test('falls back to the globally selected project when no active Agent session metadata exists', () => {
    expect(resolveScratchPadExportWorkspaceId(
      'missing-session',
      [{ id: 'session-in-project-b', workspaceId: 'project-b' }],
      'project-a',
    )).toBe('project-a')
  })

  test('does not fall back to the selected project when active session metadata has no project', () => {
    expect(resolveScratchPadExportWorkspaceId(
      'legacy-session',
      [{ id: 'legacy-session' }],
      'project-a',
    )).toBeNull()
  })
})
