import { describe, expect, test } from 'bun:test'
import {
  isCurrentMarkdownScrollRestore,
  shouldMaskMarkdownForScrollRestore,
} from './markdown-scroll-restore'

describe('Markdown 滚动恢复遮罩', () => {
  test('Given 正在恢复非零阅读位置 When 用户通过目录跳转取消旧恢复 Then 立即解除正文遮罩', () => {
    const pendingRestore = {
      isMarkdown: true,
      loading: false,
      cachedScrollPosition: { top: 360, left: 0 },
      scrollKey: 'session-1:notes/guide.md',
    }

    expect(shouldMaskMarkdownForScrollRestore({
      ...pendingRestore,
      restoredScrollKey: null,
    })).toBe(true)

    expect(shouldMaskMarkdownForScrollRestore({
      ...pendingRestore,
      restoredScrollKey: pendingRestore.scrollKey,
    })).toBe(false)
  })

  test('Given 目录跳转已取消恢复 When 旧 fallback timeout 到期 Then 不得回写旧阅读位置', () => {
    const restoreEpoch = 4
    const navigationEpochAfterTocJump = 5

    expect(isCurrentMarkdownScrollRestore(restoreEpoch, navigationEpochAfterTocJump)).toBe(false)
  })

  test('does not mask a document without a nonzero saved reading position', () => {
    expect(shouldMaskMarkdownForScrollRestore({
      isMarkdown: true,
      loading: false,
      cachedScrollPosition: { top: 0, left: 0 },
      restoredScrollKey: null,
      scrollKey: 'session-1:notes/guide.md',
    })).toBe(false)
  })
})
