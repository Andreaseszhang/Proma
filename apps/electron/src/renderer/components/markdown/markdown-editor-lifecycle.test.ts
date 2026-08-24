import { describe, expect, test } from 'bun:test'
import { createMarkdownEditorLifecycle, type MarkdownEditorInstance } from './markdown-editor-lifecycle'

function editor(doc: string): MarkdownEditorInstance & { destroyed: boolean } {
  return {
    destroyed: false,
    destroy() { this.destroyed = true },
    getDoc() { return doc },
    update(value) { doc = value },
  }
}

describe('Markdown editor lifecycle', () => {
  test('preserves a normal document and applies controlled updates', async () => {
    const instance = editor('# Initial')
    const lifecycle = createMarkdownEditorLifecycle(() => instance, () => {})
    lifecycle.mount('# Initial')
    await Promise.resolve()

    lifecycle.sync('**Updated**')
    expect(instance.getDoc()).toBe('**Updated**')
  })

  test('preserves an empty document', async () => {
    const instance = editor('')
    const lifecycle = createMarkdownEditorLifecycle(() => instance, () => {})
    lifecycle.mount('')
    await Promise.resolve()

    expect(instance.getDoc()).toBe('')
  })

  test('destroys a late StrictMode instance and remounts with the latest body', async () => {
    let resolveFirst: ((value: MarkdownEditorInstance) => void) | undefined
    const first = editor('stale')
    const discarded = createMarkdownEditorLifecycle(() => new Promise((resolve) => {
      resolveFirst = resolve
    }), () => {})
    discarded.mount('stale')
    discarded.dispose()
    resolveFirst?.(first)
    await Promise.resolve()
    expect(first.destroyed).toBe(true)

    const second = editor('start')
    const live = createMarkdownEditorLifecycle(() => second, () => {})
    live.mount('start')
    live.sync('## Remounted body')
    await Promise.resolve()
    expect(second.getDoc()).toBe('## Remounted body')
  })
})
