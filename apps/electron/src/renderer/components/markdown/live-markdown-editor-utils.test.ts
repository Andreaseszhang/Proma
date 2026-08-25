import { describe, expect, test } from 'bun:test'
import {
  createAsyncInstanceLifecycle,
  detectMarkdownBlocks,
  shouldHideMarkdownSyntax,
} from './live-markdown-editor-utils'

describe('LiveMarkdownEditor helpers', () => {
  test('only hides recognized syntax outside the active cursor line', () => {
    expect(shouldHideMarkdownSyntax('HeaderMark', 1, new Set([2]), true)).toBe(true)
    expect(shouldHideMarkdownSyntax('HeaderMark', 2, new Set([2]), true)).toBe(false)
    expect(shouldHideMarkdownSyntax('Text', 1, new Set(), true)).toBe(false)
    expect(shouldHideMarkdownSyntax('Text', 1, new Set(), false)).toBe(true)
  })

  test('recognizes GFM tables, Mermaid fences, and thematic breaks without parsing frontmatter', () => {
    expect(detectMarkdownBlocks([
      '---',
      'title: retained as source',
      '---',
      '',
      '| Name | Value |',
      '| --- | :---: |',
      '| A | 1 |',
      '',
      '***',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
    ].join('\n'))).toEqual([
      { kind: 'thematic_break', startLine: 1, endLine: 1 },
      { kind: 'thematic_break', startLine: 3, endLine: 3 },
      { kind: 'table', startLine: 5, endLine: 7 },
      { kind: 'thematic_break', startLine: 9, endLine: 9 },
      { kind: 'mermaid', startLine: 11, endLine: 14 },
    ])
  })

  test('destroys an asynchronously created instance after its effect was disposed', () => {
    const lifecycle = createAsyncInstanceLifecycle<{ destroy: () => void }>()
    let destroyed = 0
    lifecycle.dispose()

    expect(lifecycle.settle({ destroy: () => { destroyed += 1 } })).toBe(false)
    expect(destroyed).toBe(1)
    expect(lifecycle.instance()).toBeNull()
  })
})
