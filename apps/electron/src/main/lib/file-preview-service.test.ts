import { describe, expect, test } from 'bun:test'
import { isAbsolutePreviewPath } from './file-preview-service'

describe('isAbsolutePreviewPath', () => {
  test('recognizes POSIX, drive-letter, and UNC paths', () => {
    expect(isAbsolutePreviewPath('/Users/andreas/skills/x/SKILL.md')).toBe(true)
    expect(isAbsolutePreviewPath('C:\\Users\\andreas\\skills\\x\\SKILL.md')).toBe(true)
    expect(isAbsolutePreviewPath('\\\\server\\share\\skills\\x\\SKILL.md')).toBe(true)
    expect(isAbsolutePreviewPath('skills/x/SKILL.md')).toBe(false)
  })
})
