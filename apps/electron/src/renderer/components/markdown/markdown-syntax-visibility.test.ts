import { describe, expect, test } from 'bun:test'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import {
  markdownSyntaxVisibilityField,
  setMarkdownSyntaxFocused,
} from './markdown-syntax-visibility'

function hiddenRanges(state: EditorState): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  state.field(markdownSyntaxVisibilityField).decorations.between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to })
  })
  return ranges
}

function stateFor(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown(), markdownSyntaxVisibilityField],
  })
}

describe('markdown syntax visibility', () => {
  test('hides Markdown markers on unfocused title, emphasis, and link lines', () => {
    const doc = '# Heading\nA **strong** [link](https://proma.cool)'
    const ranges = hiddenRanges(stateFor(doc))

    expect(ranges).toContainEqual({ from: 0, to: 1 })
    expect(ranges).toContainEqual({ from: doc.indexOf('**'), to: doc.indexOf('**') + 2 })
    expect(ranges.some((range) => range.from === doc.indexOf('['))).toBe(true)
  })

  test('shows markers on the current cursor line and keeps other lines compact', () => {
    const doc = '# Heading\nA **strong** [link](https://proma.cool)'
    const emphasisLine = doc.indexOf('**')
    const state = stateFor(doc).update({
      effects: setMarkdownSyntaxFocused(true),
      selection: { anchor: emphasisLine },
    }).state
    const ranges = hiddenRanges(state)

    expect(ranges).toContainEqual({ from: 0, to: 1 })
    expect(ranges.some((range) => range.from === emphasisLine)).toBe(false)
    expect(ranges.some((range) => range.from === doc.indexOf('['))).toBe(false)
  })

  test('supports an empty document without decorations', () => {
    expect(hiddenRanges(stateFor(''))).toEqual([])
  })
})
