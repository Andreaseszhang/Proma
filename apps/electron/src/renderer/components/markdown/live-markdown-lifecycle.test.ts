import { describe, expect, test } from 'bun:test'
import {
  shouldRebuildMarkdownHeadingDecorations,
  shouldRebuildMarkdownSyntaxDecorations,
} from './live-markdown-lifecycle'

describe('LiveMarkdown decoration lifecycle', () => {
  test('rebuilds heading metadata when background parsing advances without a document change', () => {
    expect(shouldRebuildMarkdownHeadingDecorations({
      documentChanged: false,
      syntaxTreeChanged: true,
    })).toBe(true)
  })

  test('keeps heading metadata cached when neither the document nor syntax tree changed', () => {
    expect(shouldRebuildMarkdownHeadingDecorations({
      documentChanged: false,
      syntaxTreeChanged: false,
    })).toBe(false)
  })

  test('rebuilds syntax visibility for document, selection, focus, or syntax tree changes', () => {
    const unchanged = {
      documentChanged: false,
      selectionChanged: false,
      focusChanged: false,
      syntaxTreeChanged: false,
    }

    expect(shouldRebuildMarkdownSyntaxDecorations({ ...unchanged, documentChanged: true })).toBe(true)
    expect(shouldRebuildMarkdownSyntaxDecorations({ ...unchanged, selectionChanged: true })).toBe(true)
    expect(shouldRebuildMarkdownSyntaxDecorations({ ...unchanged, focusChanged: true })).toBe(true)
    expect(shouldRebuildMarkdownSyntaxDecorations({ ...unchanged, syntaxTreeChanged: true })).toBe(true)
    expect(shouldRebuildMarkdownSyntaxDecorations(unchanged)).toBe(false)
  })
})
