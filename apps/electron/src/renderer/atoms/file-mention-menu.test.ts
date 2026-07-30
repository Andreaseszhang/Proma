import { describe, expect, test } from 'bun:test'
import {
  FILE_MENTION_MENU_DEFAULT_WIDTH,
  clampFileMentionMenuWidth,
} from './file-mention-menu'

describe('file mention menu width', () => {
  test('uses the existing menu width by default', () => {
    expect(clampFileMentionMenuWidth(FILE_MENTION_MENU_DEFAULT_WIDTH, 1440))
      .toBe(FILE_MENTION_MENU_DEFAULT_WIDTH)
  })

  test('keeps desktop resizing within the supported range', () => {
    expect(clampFileMentionMenuWidth(120, 1440)).toBe(FILE_MENTION_MENU_DEFAULT_WIDTH)
    expect(clampFileMentionMenuWidth(1200, 1440)).toBe(800)
  })

  test('fits a persisted wide menu inside a narrow viewport', () => {
    expect(clampFileMentionMenuWidth(800, 320)).toBe(304)
  })
})
