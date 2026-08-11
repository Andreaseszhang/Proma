import { describe, expect, test } from 'bun:test'
import { getPreviewFileAccess } from './preview-open-path'

describe('getPreviewFileAccess', () => {
  test('forwards a managed Skill workspace locator to the preview IPC', () => {
    expect(getPreviewFileAccess('session-a', {
      filePath: 'deep-research/SKILL.md',
      previewOnly: true,
      workspaceSkillSlug: 'team',
      legacySkillFilePath: '/old/path/skills/deep-research/SKILL.md',
    }, '/tmp/session')).toMatchObject({
      sessionId: 'session-a',
      unrestricted: true,
      workspaceSkillSlug: 'team',
      legacySkillFilePath: '/old/path/skills/deep-research/SKILL.md',
    })
  })
})
