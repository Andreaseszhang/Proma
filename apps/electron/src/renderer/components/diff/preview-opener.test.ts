import { describe, expect, test } from 'bun:test'
import { resolvePreviewMode } from './preview-opener'

describe('preview mode resolution', () => {
  test('uses the user preference when an open action has no override', () => {
    expect(resolvePreviewMode(undefined, 'tab')).toBe('tab')
    expect(resolvePreviewMode(undefined, 'split')).toBe('split')
  })

  test('allows a caller to force the right-side split preview', () => {
    expect(resolvePreviewMode({ mode: 'split' }, 'tab')).toBe('split')
  })
})
