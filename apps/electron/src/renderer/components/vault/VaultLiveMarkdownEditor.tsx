import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'
import type { VaultFileEntry } from '@proma/shared'
import ink, { type Instance } from 'ink-mde'
import { MermaidBlock } from '@proma/ui'
import { shouldRenderMermaidCodeBlock } from '../../lib/mermaid-detection'
import {
  findVaultWikiLinkAt,
  parseVaultReferences,
  resolveVaultWikiLink,
  serializeVaultReference,
  type VaultReference,
  type VaultReferenceRange,
  type VaultReferenceTrigger,
  type VaultReferenceType,
} from './vault-reference-utils'

const markdownSyntaxFocusEffect = StateEffect.define<boolean>()
const markdownSyntaxMarkerNames = new Set([
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'QuoteMark',
])
const hiddenMarkdownSyntax = Decoration.replace({ class: 'vault-markdown-syntax-hidden' })

type MarkdownSyntaxVisibility = {
  focused: boolean
  decorations: DecorationSet
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
      if (!markdownSyntaxMarkerNames.has(type.name)) return
      if (activeLines.has(state.doc.lineAt(from).number)) return
      builder.add(from, to, hiddenMarkdownSyntax)
    },
  })
  return builder.finish()
}

const markdownSyntaxVisibilityField = StateField.define<MarkdownSyntaxVisibility>({
  create: (state) => ({
    focused: false,
    decorations: markdownSyntaxDecorations(state, false),
  }),
  update: (value, transaction) => {
    let focused = value.focused
    for (const effect of transaction.effects) {
      if (effect.is(markdownSyntaxFocusEffect)) focused = effect.value
    }

    if (!transaction.docChanged && transaction.selection === undefined && focused === value.focused) {
      return value
    }

    return {
      focused,
      decorations: markdownSyntaxDecorations(transaction.state, focused),
    }
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

class VaultReferenceWidget extends WidgetType {
  constructor(
    private readonly reference: VaultReferenceRange,
    private readonly onEdit: (reference: VaultReferenceRange) => void,
  ) {
    super()
  }

  override eq(other: VaultReferenceWidget): boolean {
    return this.reference.type === other.reference.type
      && this.reference.id === other.reference.id
      && this.reference.label === other.reference.label
  }

  override toDOM(): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    const chipClass = this.reference.type === 'skill'
      ? 'skill-mention-chip'
      : this.reference.type === 'mcp'
        ? 'mcp-mention-chip'
        : this.reference.type === 'session'
          ? 'session-mention-chip'
          : this.reference.type === 'todo'
            ? 'todo-mention-chip'
            : 'calendar-event-mention-chip'
    const trigger = this.reference.type === 'skill'
      ? '/'
      : this.reference.type === 'mcp'
        ? '#'
        : this.reference.type === 'session'
          ? '&'
          : '~'
    button.className = `vault-reference-chip ${chipClass}`
    button.dataset.referenceTrigger = trigger
    button.textContent = `${trigger}${this.reference.label}`
    button.title = '点击重新选择引用'
    button.addEventListener('click', () => this.onEdit(this.reference))
    return button
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class VaultTableWidget extends WidgetType {
  constructor(private readonly rows: string[][], private readonly from: number) {
    super()
  }

  override eq(other: VaultTableWidget): boolean {
    return this.from === other.from && JSON.stringify(this.rows) === JSON.stringify(other.rows)
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vault-markdown-table'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    const table = document.createElement('table')
    table.setAttribute('aria-label', 'Markdown 表格')
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

class VaultPropertiesWidget extends WidgetType {
  constructor(private readonly entries: Array<{ key: string; value: string }>, private readonly from: number) {
    super()
  }

  override eq(other: VaultPropertiesWidget): boolean {
    return this.from === other.from && JSON.stringify(this.entries) === JSON.stringify(other.entries)
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vault-properties'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    const heading = document.createElement('div')
    heading.className = 'vault-properties-heading'
    heading.textContent = 'Properties'
    wrapper.appendChild(heading)
    const list = document.createElement('dl')
    for (const entry of this.entries) {
      const key = document.createElement('dt')
      key.textContent = entry.key
      const value = document.createElement('dd')
      value.textContent = entry.value || '未设置'
      list.append(key, value)
    }
    wrapper.appendChild(list)
    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class VaultMermaidWidget extends WidgetType {
  private root: Root | null = null

  constructor(private readonly code: string, private readonly from: number) {
    super()
  }

  override eq(other: VaultMermaidWidget): boolean {
    return this.from === other.from && this.code === other.code
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vault-mermaid-block'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    this.root = createRoot(wrapper)
    this.root.render(<MermaidBlock code={this.code} />)
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

export type VaultBlockKind = 'frontmatter' | 'table' | 'mermaid'

export interface VaultBlockMatch {
  kind: VaultBlockKind
  startLine: number
  endLine: number
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim()
  const content = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const withoutTrailingPipe = content.endsWith('|') ? content.slice(0, -1) : content
  const cells: string[] = []
  let cell = ''
  let escaped = false

  for (const character of withoutTrailingPipe) {
    if (escaped) {
      cell += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  if (escaped) cell += '\\'
  cells.push(cell.trim())
  return cells
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line)
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseYamlProperties(lines: string[]): Array<{ key: string; value: string }> {
  return lines.flatMap((line) => {
    const match = line.match(/^\s*([^:#][^:]*?):\s*(.*)$/)
    return match ? [{ key: match[1]?.trim() ?? '', value: match[2]?.trim() ?? '' }] : []
  })
}

/** Recognizes only leading `---` frontmatter, valid GFM tables, and closed Mermaid fences. */
export function detectVaultBlockKinds(markdown: string): VaultBlockMatch[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const matches: VaultBlockMatch[] = []
  let firstContentLine = 1

  if (lines[0]?.replace(/^\uFEFF/, '') === '---') {
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (closingIndex > 1 && parseYamlProperties(lines.slice(1, closingIndex)).length > 0) {
      matches.push({ kind: 'frontmatter', startLine: 1, endLine: closingIndex + 1 })
      firstContentLine = closingIndex + 2
    }
  }

  for (let lineNumber = firstContentLine; lineNumber <= lines.length; lineNumber += 1) {
    const line = lines[lineNumber - 1] ?? ''
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] ?? '`'
      const markerLength = fenceMatch[1]?.length ?? 0
      let closingLine = lineNumber + 1
      while (closingLine <= lines.length) {
        const candidate = lines[closingLine - 1] ?? ''
        if (new RegExp(`^ {0,3}\\${marker}{${markerLength},}\\s*$`).test(candidate)) break
        closingLine += 1
      }
      if (closingLine <= lines.length) {
        const info = fenceMatch[2]?.trim().split(/\s+/)[0] ?? ''
        const code = lines.slice(lineNumber, closingLine - 1).join('\n')
        if (shouldRenderMermaidCodeBlock(info ? `language-${info}` : undefined, code)) {
          matches.push({ kind: 'mermaid', startLine: lineNumber, endLine: closingLine })
        }
        lineNumber = closingLine
      }
      continue
    }

    if (!line.includes('|') || lineNumber >= lines.length || !isMarkdownTableSeparator(lines[lineNumber] ?? '')) continue
    const header = splitMarkdownTableRow(line)
    if (header.length < 2) continue
    let lastLine = lineNumber + 1
    while (lastLine < lines.length) {
      const candidate = lines[lastLine] ?? ''
      if (!candidate.trim() || !candidate.includes('|')) break
      lastLine += 1
    }
    matches.push({ kind: 'table', startLine: lineNumber, endLine: lastLine })
    lineNumber = lastLine - 1
  }

  return matches
}

interface VaultBlock {
  from: number
  to: number
  decoration: Decoration
}

function buildVaultBlocks(state: EditorState): VaultBlock[] {
  const lineTexts = Array.from({ length: state.doc.lines }, (_, index) => state.doc.line(index + 1).text)
  return detectVaultBlockKinds(state.doc.toString()).flatMap((match) => {
    const from = state.doc.line(match.startLine).from
    const to = state.doc.line(match.endLine).to

    if (match.kind === 'frontmatter') {
      const entries = parseYamlProperties(lineTexts.slice(1, match.endLine - 1))
      return [{
        from,
        to,
        decoration: Decoration.replace({ widget: new VaultPropertiesWidget(entries, from), block: true }),
      }]
    }

    if (match.kind === 'table') {
      const header = splitMarkdownTableRow(lineTexts[match.startLine - 1] ?? '')
      const body = lineTexts.slice(match.startLine + 1, match.endLine)
        .map(splitMarkdownTableRow)
      const width = Math.max(header.length, ...body.map((row) => row.length))
      const rows = [header, ...body].map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
      return [{
        from,
        to,
        decoration: Decoration.replace({ widget: new VaultTableWidget(rows, from), block: true }),
      }]
    }

    const code = lineTexts.slice(match.startLine, match.endLine - 1).join('\n')
    return [{
      from,
      to,
      decoration: Decoration.replace({ widget: new VaultMermaidWidget(code, from), block: true }),
    }]
  })
}

function createVaultReferenceExtension({
  onOpenWikiLink,
  onEditReference,
  filesRef,
}: {
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  filesRef: { current: VaultFileEntry[] }
}) {
  const referenceField = StateField.define<DecorationSet>({
    create: (state) => buildReferenceDecorations(state),
    update: (value, transaction) => {
      if (!transaction.docChanged && transaction.selection === undefined) return value
      return buildReferenceDecorations(transaction.state)
    },
    provide: (field) => EditorView.decorations.from(field),
  })

  function buildReferenceDecorations(state: EditorState): DecorationSet {
    const activeLines = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
    const doc = state.doc.toString()
    const allBlocks = buildVaultBlocks(state)
    const hasActiveCursor = (block: VaultBlock): boolean => {
      const startLine = state.doc.lineAt(block.from).number
      const endLine = state.doc.lineAt(block.to).number
      return Array.from(activeLines).some((line) => line >= startLine && line <= endLine)
    }
    const blockRanges = allBlocks.filter((block) => !hasActiveCursor(block))
    const decorations: Array<{ from: number; to: number; decoration: Decoration }> = blockRanges.map((block) => ({
      from: block.from,
      to: block.to,
      decoration: block.decoration,
    }))
    const isInsideBlock = (from: number, to: number): boolean => allBlocks.some((block) => from >= block.from && to <= block.to)

    for (const reference of parseVaultReferences(doc)) {
      if (activeLines.has(state.doc.lineAt(reference.from).number) || isInsideBlock(reference.from, reference.to)) continue
      decorations.push({
        from: reference.from,
        to: reference.to,
        decoration: Decoration.replace({ widget: new VaultReferenceWidget(reference, onEditReference) }),
      })
    }

    const wikiPattern = /\[\[([^\]\n]+)\]\]/g
    let match: RegExpExecArray | null
    while ((match = wikiPattern.exec(doc)) !== null) {
      const target = match[1]?.trim() ?? ''
      const from = match.index
      const to = from + match[0].length
      if (!target || activeLines.has(state.doc.lineAt(from).number) || isInsideBlock(from, to)) continue
      const resolved = resolveVaultWikiLink(target, filesRef.current)
      const className = resolved ? 'vault-wiki-link' : 'vault-wiki-link vault-wiki-link-unresolved'
      decorations.push({ from: from + 2, to: to - 2, decoration: Decoration.mark({ class: className }) })
    }

    decorations.sort((left, right) => left.from - right.from || left.to - right.to)
    const builder = new RangeSetBuilder<Decoration>()
    for (const item of decorations) builder.add(item.from, item.to, item.decoration)
    return builder.finish()
  }

  return [
    referenceField,
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const target = event.target as HTMLElement | null
        const block = target?.closest<HTMLElement>('[data-vault-block-from]')
        if (block) {
          const from = Number(block.dataset.vaultBlockFrom)
          if (Number.isSafeInteger(from)) {
            event.preventDefault()
            view.dispatch({ selection: { anchor: from } })
            view.focus()
            return true
          }
        }
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return false
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position === null) return false
        const wikiLink = findVaultWikiLinkAt(view.state.doc.toString(), position)
        if (!wikiLink || !resolveVaultWikiLink(wikiLink.target, filesRef.current)) return false
        event.preventDefault()
        onOpenWikiLink(wikiLink.target)
        return true
      },
    }),
  ]
}


export interface VaultLiveMarkdownEditorHandle {
  insertReference: (reference: VaultReference) => void
}

interface VaultLiveMarkdownEditorProps {
  value: string
  files: VaultFileEntry[]
  onChange: (value: string) => void
  onSave: () => void
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  onRequestReference: (trigger?: VaultReferenceTrigger) => void
}

export const VaultLiveMarkdownEditor = React.forwardRef<VaultLiveMarkdownEditorHandle, VaultLiveMarkdownEditorProps>(function VaultLiveMarkdownEditor({
  value,
  files,
  onChange,
  onSave,
  onOpenWikiLink,
  onEditReference,
  onRequestReference,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const onOpenWikiLinkRef = React.useRef(onOpenWikiLink)
  const onEditReferenceRef = React.useRef(onEditReference)
  const onRequestReferenceRef = React.useRef(onRequestReference)
  const filesRef = React.useRef(files)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onOpenWikiLinkRef.current = onOpenWikiLink
  onEditReferenceRef.current = onEditReference
  onRequestReferenceRef.current = onRequestReference
  filesRef.current = files

  React.useImperativeHandle(ref, () => ({
    insertReference: (reference) => {
      instanceRef.current?.insert(serializeVaultReference(reference))
      instanceRef.current?.focus()
    },
  }), [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // ink-mde's destroy() only tears down CodeMirror; the container it renders stays in the DOM.
    // Give every effect run its own mount node so a discarded run (React StrictMode double-invoke,
    // remount) cannot leave a full-height empty shell that pushes the live editor out of view.
    const mount = document.createElement('div')
    mount.className = 'h-full min-h-0'
    host.appendChild(mount)

    let ready = false
    let disposed = false
    let localInstance: Instance | null = null
    const instancePromise = Promise.resolve(ink(mount, {
      doc: value,
      files: {
        clipboard: false,
        dragAndDrop: false,
        injectMarkup: true,
      },
      hooks: {
        afterUpdate: (nextValue) => {
          if (ready) onChangeRef.current(nextValue)
        },
      },
      interface: {
        appearance: 'auto',
        attribution: false,
        autocomplete: false,
        images: false,
        lists: true,
        readonly: false,
        spellcheck: false,
        toolbar: false,
      },
      plugins: [
        ...markdownSyntaxVisibility,
        ...createVaultReferenceExtension({
          onOpenWikiLink: (target) => onOpenWikiLinkRef.current(target),
          onEditReference: (reference) => onEditReferenceRef.current(reference),
          filesRef,
        }),
      ].map((extension) => ({
        type: 'default' as const,
        value: extension,
      })),
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
    }))
    void instancePromise.then((instance) => {
      localInstance = instance
      if (disposed) {
        instance.destroy()
        return
      }
      instanceRef.current = instance
      if (instance.getDoc() !== valueRef.current) instance.update(valueRef.current)
      ready = true
    })

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveRef.current()
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && ['/','@','#','&','~','～'].includes(event.key)) {
        event.preventDefault()
        onRequestReferenceRef.current(event.key as VaultReferenceTrigger)
      }
    }
    host.addEventListener('keydown', onKeyDown)

    return () => {
      disposed = true
      ready = false
      host.removeEventListener('keydown', onKeyDown)
      if (localInstance) localInstance.destroy()
      if (instanceRef.current === localInstance) instanceRef.current = null
      mount.remove()
    }
  // The editor owns its state after initialization; external file reloads use the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const instance = instanceRef.current
    if (!instance || instance.getDoc() === value) return
    instance.update(value)
  }, [value])

  return <div ref={hostRef} className="vault-ink-mde h-full min-h-0 [&_.ink-mde]:h-full [&_.ink-mde-editor]:min-h-0 [&_.ink-mde-editor]:overflow-auto" />
})
