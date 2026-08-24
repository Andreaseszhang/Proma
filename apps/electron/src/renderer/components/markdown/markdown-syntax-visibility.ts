import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

const markdownSyntaxFocusEffect = StateEffect.define<boolean>()
const markdownSyntaxMarkerNames = new Set([
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'QuoteMark',
])
const hiddenMarkdownSyntax = Decoration.replace({ class: 'markdown-live-editor__syntax-hidden' })

export function activeMarkdownCursorLines(state: EditorState, focused: boolean): Set<number> {
  if (!focused) return new Set()
  return new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
}

function markdownSyntaxDecorations(state: EditorState, focused: boolean): DecorationSet {
  const activeLines = activeMarkdownCursorLines(state, focused)
  const builder = new RangeSetBuilder<Decoration>()
  syntaxTree(state).iterate({
    enter: ({ type, from, to }) => {
      if (!markdownSyntaxMarkerNames.has(type.name)) return
      if (activeLines.has(state.doc.lineAt(from).number)) return
      builder.add(from, to, hiddenMarkdownSyntax)
    },
  })
  return builder.finish()
}

interface MarkdownSyntaxVisibility {
  focused: boolean
  decorations: DecorationSet
}

export const markdownSyntaxVisibilityField = StateField.define<MarkdownSyntaxVisibility>({
  create: (state) => ({
    focused: false,
    decorations: markdownSyntaxDecorations(state, false),
  }),
  update: (value, transaction) => {
    let focused = value.focused
    for (const effect of transaction.effects) {
      if (effect.is(markdownSyntaxFocusEffect)) focused = effect.value
    }
    if (!transaction.docChanged && transaction.selection === undefined && focused === value.focused) return value
    return {
      focused,
      decorations: markdownSyntaxDecorations(transaction.state, focused),
    }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

export const markdownSyntaxVisibility = [
  markdownSyntaxVisibilityField,
  EditorView.domEventHandlers({
    focus: (_event, view) => {
      view.dispatch({ effects: markdownSyntaxFocusEffect.of(true) })
      return false
    },
    blur: (_event, view) => {
      view.dispatch({ effects: markdownSyntaxFocusEffect.of(false) })
      return false
    },
  }),
]

export function setMarkdownSyntaxFocused(focused: boolean) {
  return markdownSyntaxFocusEffect.of(focused)
}
