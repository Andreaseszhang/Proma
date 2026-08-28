import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createVaultEditorMeasureScheduler, detectVaultBlockKinds, findVaultFencedCodeBlocks, shouldRebuildVaultDocumentIndex, shouldReuseVaultDecorations } from './VaultLiveMarkdownEditor'

describe('Vault CodeMirror layout measurement', () => {
  test('coalesces side-panel resize and transition invalidations until after layout', () => {
    let frame: FrameRequestCallback | null = null
    const cancelled = { value: null as number | null }
    const requestMeasure = () => { calls += 1 }
    let calls = 0
    const scheduler = createVaultEditorMeasureScheduler(
      () => ({ requestMeasure }),
      (callback) => {
        frame = callback
        return 7
      },
      (handle) => { cancelled.value = handle },
    )

    scheduler.request()
    scheduler.request()
    expect(calls).toBe(0)
    expect(frame).not.toBeNull()
    frame!(0)
    expect(calls).toBe(1)

    scheduler.request()
    scheduler.dispose()
    expect(cancelled.value).toBe(7)
  })

  test('uses the latest editor view when an initial hidden render resolves', () => {
    let frame: FrameRequestCallback | null = null
    let view: { requestMeasure: () => void } | null = null
    let calls = 0
    const scheduler = createVaultEditorMeasureScheduler(
      () => view,
      (callback) => {
        frame = callback
        return 1
      },
      () => {},
    )

    scheduler.request()
    view = { requestMeasure: () => { calls += 1 } }
    frame!(0)
    expect(calls).toBe(1)
  })
})

describe('Vault semantic decoration invalidation', () => {
  test('does not rebuild decorations when document and active cursor line are unchanged', () => {
    expect(shouldReuseVaultDecorations(false, new Set([3]), new Set([3]))).toBe(true)
    expect(shouldReuseVaultDecorations(false, new Set([3]), new Set([4]))).toBe(false)
    expect(shouldReuseVaultDecorations(true, new Set([3]), new Set([3]))).toBe(false)
  })

  test('maps a plain body edit instead of reparsing the complete document', () => {
    const protectedRanges = [{ from: 1_000_000, to: 1_000_040 }]
    expect(shouldRebuildVaultDocumentIndex([{ from: 42, to: 42, inserted: 'typing' }], protectedRanges)).toBe(false)
    expect(shouldRebuildVaultDocumentIndex([{ from: 42, to: 42, inserted: '[[' }], protectedRanges)).toBe(true)
    expect(shouldRebuildVaultDocumentIndex([{ from: 1_000_010, to: 1_000_010, inserted: 'x' }], protectedRanges)).toBe(true)
  })
})

describe('Vault CodeMirror block-widget layout', () => {
  test('keeps each rendered block’s vertical gap in its measurable border box', () => {
    const stylesheet = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8')
    const standardBlocks = stylesheet.match(/\.vault-ink-mde \.vault-markdown-table,[\s\S]*?\.vault-ink-mde \.vault-horizontal-rule \{([\s\S]*?)\n\}/)
    const propertiesBlock = stylesheet.match(/\.vault-ink-mde \.vault-properties \{([\s\S]*?)\n\}/)

    expect(standardBlocks?.[1]).toContain('padding-block: 0.9rem')
    expect(standardBlocks?.[1]).not.toMatch(/\bmargin(?:-block|-top|-bottom)?\s*:/)
    expect(stylesheet).toMatch(/\.vault-ink-mde \.vault-horizontal-rule \{\n  width: 100%;\n  padding-block: 1\.35rem;/)
    expect(propertiesBlock?.[1]).toContain('padding: 1.5rem 0 1.95rem')
    expect(propertiesBlock?.[1]).not.toMatch(/\bmargin(?:-block|-top|-bottom)?\s*:/)
  })
})

describe('Vault Shiki fenced-code ranges', () => {
  test('returns only editable code content and language for closed fences', () => {
    const markdown = '正文\n```typescript title="example"\nconst value = 1\n```\n\n```python\nprint(value)\n```'
    const blocks = findVaultFencedCodeBlocks(markdown)

    expect(blocks.map(({ language, code }) => ({ language, code }))).toEqual([
      { language: 'typescript', code: 'const value = 1' },
      { language: 'python', code: 'print(value)' },
    ])
    expect(blocks.every((block) => markdown.slice(block.from, block.to) === block.code)).toBe(true)
  })

  test('does not decorate incomplete fences while a user is still typing', () => {
    expect(findVaultFencedCodeBlocks('```ts\nconst incomplete = true')).toEqual([])
    expect(findVaultFencedCodeBlocks('```\n```')).toEqual([
      { language: '', code: '', from: 4, to: 4 },
    ])
  })
})

describe('Vault live Markdown block detection', () => {
  test('recognizes leading YAML frontmatter without treating its delimiters as thematic breaks', () => {
    expect(detectVaultBlockKinds('---\ntags: [vault]\n---\n\n正文\n---')).toEqual([
      { kind: 'frontmatter', startLine: 1, endLine: 3 },
      { kind: 'thematic_break', startLine: 6, endLine: 6 },
    ])
    expect(detectVaultBlockKinds('正文\n---\n内容\n---')).toEqual([
      { kind: 'thematic_break', startLine: 2, endLine: 2 },
      { kind: 'thematic_break', startLine: 4, endLine: 4 },
    ])
  })

  test('indexes frontmatter and later block widgets independently for the CodeMirror decoration layer', () => {
    expect(detectVaultBlockKinds('---\ntags: [vault]\n---\n\n正文\n---\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```mermaid\nflowchart TD\n  A --> B\n```')).toEqual([
      { kind: 'frontmatter', startLine: 1, endLine: 3 },
      { kind: 'thematic_break', startLine: 6, endLine: 6 },
      { kind: 'table', startLine: 8, endLine: 10 },
      { kind: 'mermaid', startLine: 12, endLine: 15 },
    ])
  })

  test('recognizes GFM tables without rendering the separator row', () => {
    expect(detectVaultBlockKinds('| Name | Value |\n| --- | :---: |\n| A | B |')).toEqual([
      { kind: 'table', startLine: 1, endLine: 3 },
    ])
  })

  test('recognizes closed Mermaid fences and leaves ordinary code fences alone', () => {
    expect(detectVaultBlockKinds('```mermaid\nflowchart TD\n  A --> B\n```')).toEqual([
      { kind: 'mermaid', startLine: 1, endLine: 4 },
    ])
    expect(detectVaultBlockKinds('```ts\nconst value = 1\n```')).toEqual([])
    expect(detectVaultBlockKinds('```mermaid\nflowchart TD\n  A --> B')).toEqual([])
  })
})
