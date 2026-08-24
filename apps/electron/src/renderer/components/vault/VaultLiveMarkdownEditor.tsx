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
import { loadVaultReferenceChoices, type VaultReferenceChoice } from './VaultReferencePicker'
import {
  findVaultWikiLinkAt,
  parseVaultReferences,
  resolveVaultWikiLink,
  serializeVaultReference,
  vaultReferenceTypeForTrigger,
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
    private readonly onActivate: (reference: VaultReferenceRange) => void,
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
    button.title = '点击打开引用；编辑引用请使用工具按钮'
    button.addEventListener('click', () => {
      if (this.reference.type === 'mcp') this.onEdit(this.reference)
      else this.onActivate(this.reference)
    })
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

interface VaultPropertyEntry {
  key: string
  value: string
}

function isVaultDateValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+)?$/.test(value)
}

function parseVaultListValue(value: string): string[] | null {
  if (!value.startsWith('[') || !value.endsWith(']')) return null
  const content = value.slice(1, -1).trim()
  if (!content) return []
  return content.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

class VaultPropertiesWidget extends WidgetType {
  constructor(private readonly entries: VaultPropertyEntry[], private readonly from: number) {
    super()
  }

  override eq(other: VaultPropertiesWidget): boolean {
    return this.from === other.from && JSON.stringify(this.entries) === JSON.stringify(other.entries)
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('section')
    wrapper.className = 'vault-properties'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    wrapper.dataset.vaultBlockKind = 'frontmatter'
    wrapper.setAttribute('aria-label', 'Properties')

    const heading = document.createElement('h2')
    heading.className = 'vault-properties-heading'
    heading.textContent = 'Properties'
    wrapper.appendChild(heading)

    const list = document.createElement('div')
    list.className = 'vault-properties-list'
    for (const entry of this.entries) {
      const dateValue = isVaultDateValue(entry.value)
      const listValue = parseVaultListValue(entry.value)
      const row = document.createElement('div')
      row.className = 'vault-property-row'

      const icon = document.createElement('span')
      icon.className = `vault-property-icon ${dateValue ? 'vault-property-icon-date' : 'vault-property-icon-text'}`
      icon.setAttribute('aria-hidden', 'true')

      const key = document.createElement('span')
      key.className = 'vault-property-key'
      key.textContent = entry.key

      const value = document.createElement('span')
      value.className = `vault-property-value${dateValue ? ' vault-property-value-date' : ''}`
      if (listValue) {
        value.classList.add('vault-property-value-list')
        for (const item of listValue) {
          const chip = document.createElement('span')
          chip.className = 'vault-property-value-chip'
          chip.textContent = item
          value.appendChild(chip)
        }
      } else {
        value.textContent = entry.value || '未设置'
      }

      row.append(icon, key, value)
      list.appendChild(row)
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
  kind: VaultBlockKind
  from: number
  to: number
  decoration: Decoration
}

function buildVaultBlocks(state: EditorState): VaultBlock[] {
  const lineTexts = Array.from({ length: state.doc.lines }, (_, index) => state.doc.line(index + 1).text)
  return detectVaultBlockKinds(state.doc.toString()).flatMap((match): VaultBlock[] => {
    const from = state.doc.line(match.startLine).from
    const to = state.doc.line(match.endLine).to

    if (match.kind === 'frontmatter') {
      const entries = parseYamlProperties(lineTexts.slice(1, match.endLine - 1))
      return [{
        kind: match.kind,
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
        kind: match.kind,
        from,
        to,
        decoration: Decoration.replace({ widget: new VaultTableWidget(rows, from), block: true }),
      }]
    }

    const code = lineTexts.slice(match.startLine, match.endLine - 1).join('\n')
    return [{
      kind: match.kind,
      from,
      to,
      decoration: Decoration.replace({ widget: new VaultMermaidWidget(code, from), block: true }),
    }]
  })
}

function createVaultReferenceExtension({
  onOpenWikiLink,
  onEditReference,
  onActivateReference,
  filesRef,
}: {
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  onActivateReference: (reference: VaultReferenceRange) => void
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
    const blockRanges = allBlocks.filter((block) => block.kind === 'frontmatter' || !hasActiveCursor(block))
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
        decoration: Decoration.replace({ widget: new VaultReferenceWidget(reference, onEditReference, onActivateReference) }),
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
          if (block.dataset.vaultBlockKind === 'frontmatter') {
            event.preventDefault()
            return true
          }
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
        const pointTarget = document.elementFromPoint(event.clientX, event.clientY)
        const wikiElement = pointTarget?.closest<HTMLElement>('.vault-wiki-link')
        if (!wikiElement || !view.dom.contains(wikiElement)) return false
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
  onActivateReference: (reference: VaultReferenceRange) => void
  workspaceSlug: string | null
}

export const VaultLiveMarkdownEditor = React.forwardRef<VaultLiveMarkdownEditorHandle, VaultLiveMarkdownEditorProps>(function VaultLiveMarkdownEditor({
  value,
  files,
  onChange,
  onSave,
  onOpenWikiLink,
  onEditReference,
  onActivateReference,
  workspaceSlug,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const onOpenWikiLinkRef = React.useRef(onOpenWikiLink)
  const onEditReferenceRef = React.useRef(onEditReference)
  const onActivateReferenceRef = React.useRef(onActivateReference)
  const workspaceSlugRef = React.useRef(workspaceSlug)
  const [suggestion, setSuggestion] = React.useState<{ trigger: VaultReferenceTrigger; type: VaultReferenceType | 'all'; query: string; from: number; left: number; top: number } | null>(null)
  const [suggestionItems, setSuggestionItems] = React.useState<VaultReferenceChoice[]>([])
  const [suggestionIndex, setSuggestionIndex] = React.useState(0)
  const suggestionRef = React.useRef(suggestion)
  const suggestionItemsRef = React.useRef(suggestionItems)
  const suggestionIndexRef = React.useRef(suggestionIndex)
  suggestionRef.current = suggestion
  suggestionItemsRef.current = suggestionItems
  suggestionIndexRef.current = suggestionIndex
  const filesRef = React.useRef(files)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onOpenWikiLinkRef.current = onOpenWikiLink
  onEditReferenceRef.current = onEditReference
  onActivateReferenceRef.current = onActivateReference
  workspaceSlugRef.current = workspaceSlug
  filesRef.current = files

  React.useEffect(() => {
    if (!suggestion) {
      setSuggestionItems([])
      return
    }
    let cancelled = false
    setSuggestionIndex(0)
    void loadVaultReferenceChoices(suggestion.type, suggestion.query, workspaceSlugRef.current)
      .then((items) => { if (!cancelled) setSuggestionItems(items) })
      .catch(() => { if (!cancelled) setSuggestionItems([]) })
    return () => { cancelled = true }
  }, [suggestion])

  const selectSuggestion = React.useCallback((choice: VaultReferenceChoice): void => {
    const current = suggestionRef.current
    const instance = instanceRef.current
    if (!current || !instance) return
    instance.insert(serializeVaultReference(choice.reference), { start: current.from, end: current.from })
    setSuggestion(null)
    instance.focus()
  }, [])


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
          onActivateReference: (reference) => onActivateReferenceRef.current(reference),
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
      const currentSuggestion = suggestionRef.current
      if (currentSuggestion) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setSuggestion(null)
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          setSuggestionIndex((current) => {
            if (suggestionItemsRef.current.length === 0) return 0
            return event.key === 'ArrowUp'
              ? (current <= 0 ? suggestionItemsRef.current.length - 1 : current - 1)
              : (current >= suggestionItemsRef.current.length - 1 ? 0 : current + 1)
          })
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const choice = suggestionItemsRef.current[suggestionIndexRef.current]
          if (choice) selectSuggestion(choice)
          return
        }
        if (event.key === 'Backspace') {
          event.preventDefault()
          setSuggestion((current) => {
            if (!current || current.query.length === 0) return null
            return { ...current, query: current.query.slice(0, -1) }
          })
          return
        }
        if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
          event.preventDefault()
          setSuggestion((current) => current ? { ...current, query: current.query + event.key } : current)
        }
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && ['/', '#', '&', '~', '～', '*'].includes(event.key)) {
        event.preventDefault()
        const instance = instanceRef.current
        const from = instance?.selections()[0]?.end ?? 0
        const cursor = host.querySelector<HTMLElement>('.cm-cursor')?.getBoundingClientRect()
        const hostRect = host.getBoundingClientRect()
        const trigger = event.key as VaultReferenceTrigger
        const type = trigger === '*' ? 'all' : vaultReferenceTypeForTrigger(trigger)
        if (!type) return
        setSuggestion({
          trigger,
          type,
          query: '',
          from,
          left: Math.max(8, (cursor?.left ?? hostRect.left) - hostRect.left),
          top: Math.max(8, (cursor?.bottom ?? hostRect.top + 24) - hostRect.top + 4),
        })
      }
    }
    host.addEventListener('keydown', onKeyDown)

    return () => {
      disposed = true
      ready = false
      host.removeEventListener('keydown', onKeyDown)
      setSuggestion(null)
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

  return (
    <div ref={hostRef} className="vault-ink-mde relative h-full min-h-0 [&_.ink-mde]:h-full [&_.ink-mde-editor]:min-h-0 [&_.ink-mde-editor]:overflow-auto">
      {suggestion && (
        <div
          className="absolute z-50 w-[300px] overflow-hidden rounded-lg bg-popover shadow-lg ring-1 ring-border/60"
          style={{ left: suggestion.left, top: suggestion.top }}
          role="listbox"
          aria-label={`${suggestion.trigger} 引用建议`}
        >
          <div className="flex items-center justify-between border-b border-border/50 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary">
            <span>{suggestion.trigger} {suggestion.type === 'all' ? 'Proma 引用' : suggestion.type}</span>
            <span className="font-normal text-muted-foreground">Esc 关闭 · Enter 选中</span>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {suggestionItems.length === 0 ? (
              <div className="p-2 text-[11px] text-muted-foreground">没有匹配的引用</div>
            ) : suggestionItems.map((choice, index) => (
              <button
                key={`${choice.reference.type}:${choice.reference.id}`}
                type="button"
                role="option"
                aria-selected={index === suggestionIndex}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent ${index === suggestionIndex ? 'bg-accent text-accent-foreground' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectSuggestion(choice)
                }}
              >
                <span className="w-4 shrink-0 text-center text-muted-foreground">{choice.reference.type === 'skill' ? '/' : choice.reference.type === 'mcp' ? '#' : choice.reference.type === 'session' ? '&' : '~'}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{choice.reference.label}</span>
                <span className="max-w-[110px] truncate text-[10px] text-muted-foreground">{choice.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
