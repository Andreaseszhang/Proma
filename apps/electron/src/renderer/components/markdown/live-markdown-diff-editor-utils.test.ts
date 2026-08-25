import { describe, expect, test } from 'bun:test'
import { MAX_LIVE_MARKDOWN_DIFF_LINES, canRenderMarkdownDiff, countMarkdownLines } from './live-markdown-diff-editor-utils'

describe('LiveMarkdownDiffEditor helpers', () => {
  test('counts empty, single-line and newline-terminated Markdown consistently', () => {
    expect(countMarkdownLines('')).toBe(0)
    expect(countMarkdownLines('# Title')).toBe(1)
    expect(countMarkdownLines('# Title\n')).toBe(2)
  })

  test('rejects either side above the interactive Diff line limit', () => {
    const atLimit = Array.from({ length: MAX_LIVE_MARKDOWN_DIFF_LINES }, (_, index) => `line ${index}`).join('\n')
    const overLimit = `${atLimit}\nline overflow`

    expect(canRenderMarkdownDiff(atLimit, atLimit)).toBe(true)
    expect(canRenderMarkdownDiff(overLimit, atLimit)).toBe(false)
    expect(canRenderMarkdownDiff(atLimit, overLimit)).toBe(false)
  })
})
