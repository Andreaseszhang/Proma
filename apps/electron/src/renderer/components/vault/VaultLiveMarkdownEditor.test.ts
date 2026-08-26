import { describe, expect, test } from 'bun:test'
import { createVaultEditorMeasureScheduler, detectVaultBlockKinds } from './VaultLiveMarkdownEditor'

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
