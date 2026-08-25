import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { syntaxTree } from '@codemirror/language'
import { Prec, RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view'
import { parseDiffFromFile, type FileContents } from '@pierre/diffs'
import ink, { type Instance } from 'ink-mde'
import { MermaidBlock } from '@proma/ui'
import { cn } from '@/lib/utils'
import {
  createAsyncInstanceLifecycle,
  detectMarkdownBlocks,
  shouldHideMarkdownSyntax,
  splitMarkdownTableRow,
  type MarkdownBlockKind,
} from './live-markdown-editor-utils'
import { canRenderMarkdownDiff } from './live-markdown-diff-editor-utils'

const markdownSyntaxFocusEffect = StateEffect.define<boolean>()
const hiddenMarkdownSyntax = Decoration.replace({ class: 'live-markdown-editor__syntax-hidden' })

type MarkdownSyntaxVisibility = {
  focused: boolean
  decorations: DecorationSet
}

export interface LiveMarkdownEditorHandle {
  focus: () => void
  insertText: (text: string) => void
}

export interface LiveMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
  onSave?: () => void
  /** Keeps the Agent-produced change visible as editable inline Diff decorations. */
  diffReview?: { beforeValue: string; afterValue: string }
  /** Overrides the built-in Mermaid renderer for hosts with a custom diagram surface. */
  renderMermaid?: (code: string) => React.ReactNode
}

function activeCursorLines(state: EditorState, focused: boolean): Set<number> {
  if (!focused) return new Set()
  return new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
}

function markdownSyntaxDecorations(state: EditorState, focused: boolean): DecorationSet {
  const activeLines = activeCursorLines(state, focused)
  const builder = new RangeSetBuilder<Decoration>()
  syntaxTree(state).iterate({
    enter: ({ type, from, to }) => {
      if (!shouldHideMarkdownSyntax(type.name, state.doc.lineAt(from).number, activeLines, focused)) return
      builder.add(from, to, hiddenMarkdownSyntax)
    },
  })
  return builder.finish()
}

const markdownSyntaxVisibilityField = StateField.define<MarkdownSyntaxVisibility>({
  create: (state) => ({ focused: false, decorations: markdownSyntaxDecorations(state, false) }),
  update: (value, transaction) => {
    let focused = value.focused
    for (const effect of transaction.effects) {
      if (effect.is(markdownSyntaxFocusEffect)) focused = effect.value
    }
    if (!transaction.docChanged && transaction.selection === undefined && focused === value.focused) return value
    return { focused, decorations: markdownSyntaxDecorations(transaction.state, focused) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

const markdownSyntaxVisibility = [
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

class MarkdownTableWidget extends WidgetType {
  constructor(private readonly rows: string[][], private readonly from: number) {
    super()
  }

  override eq(other: MarkdownTableWidget): boolean {
    return this.from === other.from && JSON.stringify(this.rows) === JSON.stringify(other.rows)
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'live-markdown-editor__table'
    wrapper.dataset.liveMarkdownBlockFrom = String(this.from)
    const table = document.createElement('table')
    table.setAttribute('aria-label', 'Markdown table')
    this.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr')
      row.forEach((value) => {
        const cell = document.createElement(rowIndex === 0 ? 'th' : 'td')
        cell.textContent = value
        tr.appendChild(cell)
      })
      table.appendChild(tr)
    })
    wrapper.appendChild(table)
    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class HorizontalRuleWidget extends WidgetType {
  constructor(private readonly from: number) {
    super()
  }

  override eq(other: HorizontalRuleWidget): boolean {
    return this.from === other.from
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'live-markdown-editor__thematic-break'
    wrapper.dataset.liveMarkdownBlockFrom = String(this.from)
    wrapper.appendChild(document.createElement('hr'))
    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class MermaidWidget extends WidgetType {
  private root: Root | null = null

  constructor(
    private readonly code: string,
    private readonly from: number,
    private readonly renderMermaid: (code: string) => React.ReactNode,
  ) {
    super()
  }

  override eq(other: MermaidWidget): boolean {
    return this.from === other.from && this.code === other.code
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'live-markdown-editor__mermaid'
    wrapper.dataset.liveMarkdownBlockFrom = String(this.from)
    this.root = createRoot(wrapper)
    this.root.render(this.renderMermaid(this.code))
    return wrapper
  }

  override destroy(): void {
    this.root?.unmount()
    this.root = null
  }

  override ignoreEvent(): boolean {
    return false
  }
}

interface MarkdownBlock {
  kind: MarkdownBlockKind
  from: number
  to: number
  decoration: Decoration
}

function buildMarkdownBlocks(state: EditorState, renderMermaid: (code: string) => React.ReactNode): MarkdownBlock[] {
  const lineTexts = Array.from({ length: state.doc.lines }, (_, index) => state.doc.line(index + 1).text)
  return detectMarkdownBlocks(state.doc.toString()).map((match): MarkdownBlock => {
    const from = state.doc.line(match.startLine).from
    const to = state.doc.line(match.endLine).to
    if (match.kind === 'table') {
      const header = splitMarkdownTableRow(lineTexts[match.startLine - 1] ?? '')
      const body = lineTexts.slice(match.startLine + 1, match.endLine).map(splitMarkdownTableRow)
      const width = Math.max(header.length, ...body.map((row) => row.length))
      const rows = [header, ...body].map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
      return { kind: match.kind, from, to, decoration: Decoration.replace({ widget: new MarkdownTableWidget(rows, from), block: true }) }
    }
    if (match.kind === 'thematic_break') {
      return { kind: match.kind, from, to, decoration: Decoration.replace({ widget: new HorizontalRuleWidget(from), block: true }) }
    }
    const code = lineTexts.slice(match.startLine, match.endLine - 1).join('\n')
    return { kind: match.kind, from, to, decoration: Decoration.replace({ widget: new MermaidWidget(code, from, renderMermaid), block: true }) }
  })
}

class DeletedDiffLinesWidget extends WidgetType {
  constructor(private readonly lines: string[]) {
    super()
  }

  override eq(other: DeletedDiffLinesWidget): boolean {
    return this.lines.join('\n') === other.lines.join('\n')
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'live-markdown-editor__diff-deletions'
    for (const line of this.lines) {
      const row = document.createElement('div')
      row.className = 'live-markdown-editor__diff-deletion'
      row.textContent = `- ${line || ' '}`
      wrapper.appendChild(row)
    }
    return wrapper
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** Builds stable line decorations once; later user edits map them instead of recomputing a Diff on every keystroke. */
function createMarkdownDiffExtension(review: NonNullable<LiveMarkdownEditorProps['diffReview']>) {
  if (!canRenderMarkdownDiff(review.beforeValue, review.afterValue) || review.beforeValue === review.afterValue) return []
  const oldFile: FileContents = { name: 'document.md', contents: review.beforeValue }
  const newFile: FileContents = { name: 'document.md', contents: review.afterValue }
  let fileDiff: ReturnType<typeof parseDiffFromFile>
  try {
    fileDiff = parseDiffFromFile(oldFile, newFile)
  } catch {
    return []
  }

  const diffField = StateField.define<DecorationSet>({
    create: (state) => {
      const builder = new RangeSetBuilder<Decoration>()
      for (const hunk of fileDiff.hunks) {
        for (const content of hunk.hunkContent) {
          if (content.type !== 'change') continue
          if (content.deletions > 0) {
            const deletedLines = fileDiff.deletionLines.slice(content.deletionLineIndex, content.deletionLineIndex + content.deletions)
            const insertionLine = content.additionLineIndex
            const position = insertionLine < state.doc.lines ? state.doc.line(insertionLine + 1).from : state.doc.length
            builder.add(position, position, Decoration.widget({ widget: new DeletedDiffLinesWidget(deletedLines), side: -1, block: true }))
          }
          for (let index = 0; index < content.additions; index += 1) {
            const lineIndex = content.additionLineIndex + index
            if (lineIndex >= state.doc.lines) continue
            const line = state.doc.line(lineIndex + 1)
            builder.add(line.from, line.from, Decoration.line({ class: 'live-markdown-editor__diff-addition' }))
          }
        }
      }
      return builder.finish()
    },
    update: (value, transaction) => transaction.docChanged ? value.map(transaction.changes) : value,
    provide: (field) => EditorView.decorations.from(field),
  })

  return [diffField]
}

function createMarkdownBlockExtension(renderMermaid: (code: string) => React.ReactNode) {
  const blockField = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state),
    update: (value, transaction) => {
      if (!transaction.docChanged && transaction.selection === undefined) return value
      return buildDecorations(transaction.state)
    },
    provide: (field) => EditorView.decorations.from(field),
  })

  function buildDecorations(state: EditorState): DecorationSet {
    const activeLines = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
    const blocks = buildMarkdownBlocks(state, renderMermaid).filter((block) => {
      const startLine = state.doc.lineAt(block.from).number
      const endLine = state.doc.lineAt(block.to).number
      return !Array.from(activeLines).some((line) => line >= startLine && line <= endLine)
    })
    const builder = new RangeSetBuilder<Decoration>()
    for (const block of blocks) builder.add(block.from, block.to, block.decoration)
    return builder.finish()
  }

  return [
    blockField,
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const block = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-live-markdown-block-from]')
        if (!block) return false
        const from = Number(block.dataset.liveMarkdownBlockFrom)
        if (!Number.isSafeInteger(from)) return false
        event.preventDefault()
        view.dispatch({ selection: { anchor: from } })
        view.focus()
        return true
      },
    }),
  ]
}

export const LiveMarkdownEditor = React.forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(function LiveMarkdownEditor({
  value,
  onChange,
  readOnly = false,
  autoFocus = false,
  placeholder,
  className,
  onSave,
  diffReview,
  renderMermaid = (code) => <MermaidBlock code={code} />,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const readOnlyRef = React.useRef(readOnly)
  const autoFocusRef = React.useRef(autoFocus)
  const renderMermaidRef = React.useRef(renderMermaid)
  const diffReviewRef = React.useRef(diffReview)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  readOnlyRef.current = readOnly
  renderMermaidRef.current = renderMermaid

  React.useImperativeHandle(ref, () => ({
    focus: () => instanceRef.current?.focus(),
    insertText: (text) => {
      if (!readOnlyRef.current) instanceRef.current?.insert(text)
    },
  }), [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'h-full min-h-0'
    host.appendChild(mount)
    const lifecycle = createAsyncInstanceLifecycle<Instance>()
    let ready = false

    void Promise.resolve(ink(mount, {
      doc: value,
      placeholder,
      files: { clipboard: false, dragAndDrop: false, injectMarkup: true },
      hooks: {
        afterUpdate: (nextValue) => {
          if (ready && !readOnlyRef.current) onChangeRef.current(nextValue)
        },
      },
      interface: {
        appearance: 'auto',
        attribution: false,
        autocomplete: false,
        images: false,
        lists: true,
        readonly: readOnly,
        spellcheck: false,
        toolbar: false,
      },
      plugins: [
        Prec.highest(keymap.of([{ key: 'Mod-s', run: () => { onSaveRef.current?.(); return Boolean(onSaveRef.current) } }])),
        ...markdownSyntaxVisibility,
        ...(diffReviewRef.current
          ? createMarkdownDiffExtension(diffReviewRef.current)
          : createMarkdownBlockExtension((code) => renderMermaidRef.current(code))),
      ].map((extension) => ({ type: 'default' as const, value: extension })),
      search: false,
      toolbar: {
        bold: false,
        code: false,
        codeBlock: false,
        heading: false,
        image: false,
        italic: false,
        link: false,
        list: false,
        orderedList: false,
        quote: false,
        taskList: false,
        upload: false,
      },
    })).then((instance) => {
      if (!lifecycle.settle(instance)) return
      instanceRef.current = instance
      if (instance.getDoc() !== valueRef.current) instance.update(valueRef.current)
      ready = true
      if (autoFocusRef.current && !readOnlyRef.current) instance.focus()
    })

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveRef.current?.()
      }
    }
    const onWheel = (event: WheelEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.cm-scroller')) return
      const scroller = host.querySelector<HTMLElement>('.cm-scroller')
      if (!scroller) return
      scroller.scrollTop += event.deltaY
      scroller.scrollLeft += event.deltaX
      event.preventDefault()
    }
    host.addEventListener('keydown', onKeyDown)
    host.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      ready = false
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('wheel', onWheel)
      const instance = lifecycle.instance()
      lifecycle.dispose()
      if (instanceRef.current === instance) instanceRef.current = null
      mount.remove()
    }
  // The editor owns its document after mount; external value changes use the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const instance = instanceRef.current
    if (instance && instance.getDoc() !== value) instance.update(value)
  }, [value])

  React.useEffect(() => {
    instanceRef.current?.reconfigure({ interface: { readonly: readOnly } })
  }, [readOnly])

  return <div ref={hostRef} className={cn('live-markdown-editor relative h-full min-h-0', className)} />
})
