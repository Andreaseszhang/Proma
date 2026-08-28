import * as React from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { syntaxTree } from '@codemirror/language'
import { Prec, RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view'
import type { VaultFileEntry } from '@proma/shared'
import { highlightCode, highlightToTokens } from '@proma/core'
import type { HighlightTokensResult } from '@proma/core'
import ink, { type Instance } from 'ink-mde'
import { MermaidBlock } from '@proma/ui'
import { CalendarDays, ListTodo, MessageSquareText, Server, Sparkles } from 'lucide-react'
import { MentionList, type MentionListRef } from '@/components/agent/MentionList'
import { shouldRenderMermaidCodeBlock } from '../../lib/mermaid-detection'
import { loadVaultReferenceChoices, type VaultReferenceChoice } from './VaultReferencePicker'
import { createLatestDebouncedRequest } from './vault-reference-query'
import { createVaultWikiLinkResolver, type VaultWikiLinkResolver } from './vault-wiki-resolver'
import {
  findVaultWikiLinkAt,
  parseVaultReferences,
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
const pendingListHeading = Decoration.mark({ class: 'vault-pending-list-heading' })

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
      // A trailing `-` is parsed as a Setext H2 until its first list-item
      // character arrives. Preserve the user's normal list typing by rendering
      // that transient state at the paragraph font size instead of as a heading.
      if (type.name === 'SetextHeading2') {
        const underline = state.doc.lineAt(to)
        if (underline.to === state.doc.length && /^-\s*$/.test(underline.text)) {
          const headingLine = state.doc.lineAt(from)
          builder.add(headingLine.from, headingLine.to, pendingListHeading)
        }
      }

      if (!markdownSyntaxMarkerNames.has(type.name)) return
      if (activeLines.has(state.doc.lineAt(from).number)) return
      // Lezer's HeaderMark excludes the required space after `#`. Hide it with
      // the marker so rendered ATX headings align with ordinary paragraph text.
      const markerEnd = type.name === 'HeaderMark' && state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
      builder.add(from, markerEnd, hiddenMarkdownSyntax)
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

const vaultShikiRefreshEffect = StateEffect.define<string>()
const vaultShikiTokenCache = new Map<string, HighlightTokensResult>()
const VAULT_SHIKI_TOKEN_CACHE_LIMIT = 160
const VAULT_SHIKI_REFRESH_DELAY_MS = 120

type VaultFencedCodeBlock = {
  language: string
  code: string
  from: number
  to: number
}

type VaultShikiDecorations = {
  decorations: DecorationSet
}

/** Finds closed fences so Shiki can decorate only editable code, not fence syntax. */
export function findVaultFencedCodeBlocks(markdown: string): VaultFencedCodeBlock[] {
  const lines = markdown.split('\n')
  const lineStarts: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStarts.push(offset)
    offset += line.length + 1
  }

  const blocks: VaultFencedCodeBlock[] = []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const openingLine = lines[lineIndex] ?? ''
    const opening = openingLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (!opening) continue

    const marker = opening[1]?.[0] ?? '`'
    const markerLength = opening[1]?.length ?? 0
    let closingIndex = lineIndex + 1
    while (closingIndex < lines.length) {
      const candidate = lines[closingIndex] ?? ''
      if (new RegExp(`^ {0,3}\\${marker}{${markerLength},}\\s*$`).test(candidate)) break
      closingIndex += 1
    }
    if (closingIndex >= lines.length) continue

    const language = opening[2]?.trim().split(/\s+/)[0] ?? ''
    const from = lineStarts[lineIndex + 1] ?? lineStarts[closingIndex] ?? markdown.length
    const closingFrom = lineStarts[closingIndex] ?? markdown.length
    const to = Math.max(from, closingFrom - 1)
    blocks.push({
      language,
      code: markdown.slice(from, to),
      from,
      to,
    })
    lineIndex = closingIndex
  }
  return blocks
}

function getVaultShikiTheme(): string {
  return document.documentElement.classList.contains('dark') ? 'github-dark' : 'github-light'
}

function shouldLoadVaultShikiLanguage(requestedLanguage: string, result: HighlightTokensResult | null): boolean {
  return requestedLanguage !== 'text' && (!result || result.language === 'text')
}

function getCachedVaultShikiTokens(code: string, language: string, theme: string): HighlightTokensResult | null {
  const key = `${theme}\u0000${language}\u0000${code}`
  const cached = vaultShikiTokenCache.get(key)
  if (cached) {
    vaultShikiTokenCache.delete(key)
    vaultShikiTokenCache.set(key, cached)
    return cached
  }

  const result = highlightToTokens({ code, language, theme })
  if (!result || shouldLoadVaultShikiLanguage(language, result)) return result

  vaultShikiTokenCache.set(key, result)
  if (vaultShikiTokenCache.size > VAULT_SHIKI_TOKEN_CACHE_LIMIT) {
    const oldestKey = vaultShikiTokenCache.keys().next().value
    if (oldestKey) vaultShikiTokenCache.delete(oldestKey)
  }
  return result
}

function buildVaultShikiDecorations(state: EditorState, theme: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const blocks = findVaultFencedCodeBlocks(state.doc.toString())

  for (const block of blocks) {
    const language = block.language || 'text'
    // Mermaid is replaced by the shared interactive widget, so its hidden source
    // does not need token work beneath the block decoration.
    if (shouldRenderMermaidCodeBlock(block.language ? `language-${block.language}` : undefined, block.code)) continue

    const result = getCachedVaultShikiTokens(block.code, language, theme)
    if (!result) continue

    let offset = block.from
    for (const [lineIndex, line] of result.lines.entries()) {
      for (const token of line) {
        const from = offset
        const to = Math.min(from + token.content.length, block.to)
        if (token.color && from < to) {
          builder.add(from, to, Decoration.mark({ attributes: { style: `color: ${token.color}` } }))
        }
        offset = to
      }
      if (lineIndex < result.lines.length - 1 && offset < block.to) offset += 1
    }
  }

  return builder.finish()
}

function requestVaultShikiLanguages(view: EditorView, theme: string, pending: Set<string>, isActive: () => boolean): void {
  const languages = new Set(
    findVaultFencedCodeBlocks(view.state.doc.toString())
      .filter((block) => !shouldRenderMermaidCodeBlock(block.language ? `language-${block.language}` : undefined, block.code))
      .map((block) => block.language || 'text'),
  )

  const requests: Array<Promise<unknown>> = []
  for (const language of languages) {
    const result = highlightToTokens({ code: '', language, theme })
    // A null result means the shared highlighter itself is not ready yet,
    // including unlabelled (`text`) blocks, so it must still be initialized.
    if (result && !shouldLoadVaultShikiLanguage(language, result)) continue

    const key = `${theme}:${language}`
    if (pending.has(key)) continue
    pending.add(key)
    requests.push(highlightCode({ code: '', language, theme }).catch((error) => {
      console.error('[VaultLiveMarkdownEditor] Shiki language load failed:', error)
    }).finally(() => pending.delete(key)))
  }

  if (requests.length === 0) return
  void Promise.all(requests).then(() => {
    if (isActive()) view.dispatch({ effects: vaultShikiRefreshEffect.of(theme) })
  })
}

const vaultShikiDecorationsField = StateField.define<VaultShikiDecorations>({
  create: () => ({ decorations: Decoration.none }),
  update: (value, transaction) => {
    const refresh = transaction.effects.find((effect) => effect.is(vaultShikiRefreshEffect))
    if (refresh) return { decorations: buildVaultShikiDecorations(transaction.state, refresh.value) }
    return { decorations: value.decorations.map(transaction.changes) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

/**
 * Same Shiki token pipeline as Markdown preview and Agent responses. Full token
 * work runs only after a debounced document change; every keystroke maps the
 * existing ranges, preserving CodeMirror's immediate editing responsiveness.
 */
const vaultShikiCodeHighlight = [
  vaultShikiDecorationsField,
  ViewPlugin.fromClass(class {
    private pending = new Set<string>()
    private scheduleHandle: ReturnType<typeof setTimeout> | null = null
    private destroyed = false
    private theme = getVaultShikiTheme()
    private themeObserver: MutationObserver

    constructor(private readonly view: EditorView) {
      this.themeObserver = new MutationObserver(() => {
        const nextTheme = getVaultShikiTheme()
        if (nextTheme === this.theme) return
        this.theme = nextTheme
        this.refreshNow()
      })
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      this.scheduleRefresh(0)
    }

    update(update: { docChanged: boolean }): void {
      if (update.docChanged) this.scheduleRefresh(VAULT_SHIKI_REFRESH_DELAY_MS)
    }

    destroy(): void {
      this.destroyed = true
      this.themeObserver.disconnect()
      if (this.scheduleHandle !== null) clearTimeout(this.scheduleHandle)
    }

    private scheduleRefresh(delay: number): void {
      if (this.scheduleHandle !== null) clearTimeout(this.scheduleHandle)
      this.scheduleHandle = setTimeout(() => {
        this.scheduleHandle = null
        this.refreshNow()
      }, delay)
    }

    private refreshNow(): void {
      if (this.destroyed) return
      requestVaultShikiLanguages(this.view, this.theme, this.pending, () => !this.destroyed)
      this.view.dispatch({ effects: vaultShikiRefreshEffect.of(this.theme) })
    }
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
    button.dataset.referenceType = this.reference.type
    button.dataset.referenceLabel = this.reference.label
    button.textContent = `${trigger}${this.reference.label}`
    button.addEventListener('click', (event) => {
      if (event.altKey) this.onEdit(this.reference)
      else this.onActivate(this.reference)
    })
    return button
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * CodeMirror's height map measures block-widget DOM rectangles, which exclude
 * CSS margins. Watch intrinsic widget resizes (notably async Mermaid renders)
 * and schedule a fresh measure after layout has settled.
 */
abstract class VaultBlockWidget extends WidgetType {
  private sizeObserver: ResizeObserver | null = null
  private measureScheduler: ReturnType<typeof createVaultEditorMeasureScheduler> | null = null

  protected watchSize(element: HTMLElement, view: EditorView): void {
    this.measureScheduler = createVaultEditorMeasureScheduler(() => view)
    if (typeof ResizeObserver === 'function') {
      this.sizeObserver = new ResizeObserver(this.measureScheduler.request)
      this.sizeObserver.observe(element)
    }
    this.measureScheduler.request()
  }

  override destroy(_dom: HTMLElement): void {
    this.sizeObserver?.disconnect()
    this.sizeObserver = null
    this.measureScheduler?.dispose()
    this.measureScheduler = null
  }
}

class VaultTableWidget extends VaultBlockWidget {
  constructor(private readonly rows: string[][], private readonly from: number) {
    super()
  }

  override eq(other: VaultTableWidget): boolean {
    return this.from === other.from && JSON.stringify(this.rows) === JSON.stringify(other.rows)
  }

  override toDOM(view: EditorView): HTMLElement {
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
    this.watchSize(wrapper, view)
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

class VaultHorizontalRuleWidget extends VaultBlockWidget {
  constructor(private readonly from: number) {
    super()
  }

  override eq(other: VaultHorizontalRuleWidget): boolean {
    return this.from === other.from
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vault-horizontal-rule'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    const rule = document.createElement('hr')
    wrapper.appendChild(rule)
    this.watchSize(wrapper, view)
    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class VaultPropertiesWidget extends VaultBlockWidget {
  constructor(
    private readonly entries: VaultPropertyEntry[],
    private readonly from: number,
    private readonly onChange: (entries: VaultPropertyEntry[]) => void,
  ) {
    super()
  }

  override eq(other: VaultPropertiesWidget): boolean {
    return this.from === other.from && JSON.stringify(this.entries) === JSON.stringify(other.entries)
  }

  override toDOM(view: EditorView): HTMLElement {
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
    this.entries.forEach((entry, index) => {
      const dateValue = isVaultDateValue(entry.value)
      const row = document.createElement('div')
      row.className = 'vault-property-row'

      const icon = document.createElement('span')
      icon.className = `vault-property-icon ${dateValue ? 'vault-property-icon-date' : 'vault-property-icon-text'}`
      icon.setAttribute('aria-hidden', 'true')

      const key = document.createElement('input')
      key.className = 'vault-property-key vault-property-input'
      key.value = entry.key
      key.setAttribute('aria-label', `Property ${entry.key} 名称`)
      key.spellcheck = false

      const value = document.createElement('input')
      value.className = `vault-property-value vault-property-input${dateValue ? ' vault-property-value-date' : ''}`
      value.value = entry.value
      value.setAttribute('aria-label', `${entry.key} 属性值`)
      value.spellcheck = false

      const commit = (): void => {
        const next = this.entries.map((current, currentIndex) => currentIndex === index
          ? { key: key.value.trim(), value: value.value }
          : current)
        if (!key.value.trim()) return
        this.onChange(next)
      }
      key.addEventListener('blur', commit)
      value.addEventListener('blur', commit)
      key.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); key.blur() }
      })
      value.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); value.blur() }
      })

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'vault-property-remove'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `删除属性 ${entry.key}`)
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.onChange(this.entries.filter((_, currentIndex) => currentIndex !== index))
      })

      row.append(icon, key, value, remove)
      list.appendChild(row)
    })
    wrapper.appendChild(list)
    this.watchSize(wrapper, view)
    return wrapper
  }

  override ignoreEvent(): boolean {
    return true
  }
}

class VaultMermaidWidget extends VaultBlockWidget {
  private root: Root | null = null

  constructor(private readonly code: string, private readonly from: number) {
    super()
  }

  override eq(other: VaultMermaidWidget): boolean {
    return this.from === other.from && this.code === other.code
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vault-mermaid-block'
    wrapper.dataset.vaultBlockFrom = String(this.from)
    this.root = createRoot(wrapper)
    this.root.render(<MermaidBlock code={this.code} />)
    this.watchSize(wrapper, view)
    return wrapper
  }

  override destroy(dom: HTMLElement): void {
    super.destroy(dom)
    this.root?.unmount()
    this.root = null
  }

  override ignoreEvent(): boolean {
    return false
  }
}

export type VaultBlockKind = 'frontmatter' | 'table' | 'mermaid' | 'thematic_break'

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

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      matches.push({ kind: 'thematic_break', startLine: lineNumber, endLine: lineNumber })
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

function buildVaultBlocks(state: EditorState, document: string, onChangeProperties: (entries: VaultPropertyEntry[]) => void): VaultBlock[] {
  const lineTexts = Array.from({ length: state.doc.lines }, (_, index) => state.doc.line(index + 1).text)
  return detectVaultBlockKinds(document).flatMap((match): VaultBlock[] => {
    const from = state.doc.line(match.startLine).from
    const to = state.doc.line(match.endLine).to

    if (match.kind === 'frontmatter') {
      const entries = parseYamlProperties(lineTexts.slice(1, match.endLine - 1))
      return [{
        kind: match.kind,
        from,
        to,
        decoration: Decoration.replace({ widget: new VaultPropertiesWidget(entries, from, onChangeProperties), block: true }),
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

    if (match.kind === 'thematic_break') {
      return [{
        kind: match.kind,
        from,
        to,
        decoration: Decoration.replace({ widget: new VaultHorizontalRuleWidget(from), block: true }),
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

/** Chip source is revealed only when the caret sits inside or right after the marker. */
export function isCaretInsideReference(caretPositions: number[], from: number, to: number): boolean {
  return caretPositions.some((position) => position > from && position <= to)
}

interface VaultWikiLinkRange {
  target: string
  from: number
  to: number
}

interface VaultDocumentIndex {
  blocks: VaultBlock[]
  references: VaultReferenceRange[]
  wikiLinks: VaultWikiLinkRange[]
}

interface VaultDocumentIndexState {
  activeLines: Set<number>
  index: VaultDocumentIndex
  decorations: DecorationSet
}

interface VaultIndexChange {
  from: number
  to: number
  inserted: string
}

/** A plain edit outside Markdown constructs can safely reuse mapped decorations. */
export function shouldRebuildVaultDocumentIndex(
  changes: readonly VaultIndexChange[],
  protectedRanges: readonly { from: number; to: number }[],
): boolean {
  return changes.some(({ from, to, inserted }) => (
    /[\r\n\[\]|`~*_#\\-]/.test(inserted)
    || protectedRanges.some((range) => from <= range.to && to >= range.from)
  ))
}

function activeCursorLineSet(state: EditorState): Set<number> {
  return new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
}

function sameLineSet(left: Set<number>, right: Set<number>): boolean {
  return left.size === right.size && Array.from(left).every((line) => right.has(line))
}

/** Selection movements within the same line do not affect visible Markdown widgets. */
export function shouldReuseVaultDecorations(docChanged: boolean, activeLines: Set<number>, previousActiveLines: Set<number>): boolean {
  return !docChanged && sameLineSet(activeLines, previousActiveLines)
}

function buildVaultDocumentIndex(state: EditorState, onChangeProperties: (entries: VaultPropertyEntry[]) => void): VaultDocumentIndex {
  // CodeMirror keeps the document as a rope. Materialize it once only when a
  // semantic Markdown edit requires reparsing, never for a pure selection move.
  const document = state.doc.toString()
  const wikiLinks: VaultWikiLinkRange[] = []
  const wikiPattern = /\[\[([^\]\n]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = wikiPattern.exec(document)) !== null) {
    const target = match[1]?.trim() ?? ''
    if (target) wikiLinks.push({ target, from: match.index, to: match.index + match[0].length })
  }
  return {
    blocks: buildVaultBlocks(state, document, onChangeProperties),
    references: parseVaultReferences(document),
    wikiLinks,
  }
}

function mapVaultDocumentIndex(index: VaultDocumentIndex, transaction: { changes: { mapPos: (position: number, association?: number) => number } }): VaultDocumentIndex {
  const mapRange = <T extends { from: number; to: number }>(range: T): T => ({
    ...range,
    from: transaction.changes.mapPos(range.from, -1),
    to: transaction.changes.mapPos(range.to, 1),
  })
  return {
    blocks: index.blocks.map(mapRange),
    references: index.references.map(mapRange),
    wikiLinks: index.wikiLinks.map(mapRange),
  }
}

function createVaultReferenceExtension({
  onOpenWikiLink,
  onEditReference,
  onChangeProperties,
  onActivateReference,
  wikiResolverRef,
}: {
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  onChangeProperties: (entries: VaultPropertyEntry[]) => void
  onActivateReference: (reference: VaultReferenceRange) => void
  wikiResolverRef: { current: VaultWikiLinkResolver | null }
}) {
  const buildReferenceDecorations = (state: EditorState, index: VaultDocumentIndex, activeLines: Set<number>): DecorationSet => {
    const hasActiveCursor = (block: VaultBlock): boolean => {
      const startLine = state.doc.lineAt(block.from).number
      const endLine = state.doc.lineAt(block.to).number
      return Array.from(activeLines).some((line) => line >= startLine && line <= endLine)
    }
    const blockRanges = index.blocks.filter((block) => block.kind === 'frontmatter' || !hasActiveCursor(block))
    const decorations: Array<{ from: number; to: number; decoration: Decoration }> = blockRanges.map((block) => ({
      from: block.from,
      to: block.to,
      decoration: block.decoration,
    }))
    const isInsideBlock = (from: number, to: number): boolean => index.blocks.some((block) => from >= block.from && to <= block.to)

    const caretPositions = state.selection.ranges.map((range) => range.head)
    for (const reference of index.references) {
      if (isCaretInsideReference(caretPositions, reference.from, reference.to) || isInsideBlock(reference.from, reference.to)) continue
      decorations.push({
        from: reference.from,
        to: reference.to,
        decoration: Decoration.replace({ widget: new VaultReferenceWidget(reference, onEditReference, onActivateReference) }),
      })
    }

    for (const wikiLink of index.wikiLinks) {
      if (activeLines.has(state.doc.lineAt(wikiLink.from).number) || isInsideBlock(wikiLink.from, wikiLink.to)) continue
      const className = wikiResolverRef.current?.resolve(wikiLink.target)
        ? 'vault-wiki-link'
        : 'vault-wiki-link vault-wiki-link-unresolved'
      decorations.push({ from: wikiLink.from + 2, to: wikiLink.to - 2, decoration: Decoration.mark({ class: className }) })
    }

    decorations.sort((left, right) => left.from - right.from || left.to - right.to)
    const builder = new RangeSetBuilder<Decoration>()
    for (const item of decorations) builder.add(item.from, item.to, item.decoration)
    return builder.finish()
  }

  const referenceField = StateField.define<VaultDocumentIndexState>({
    create: (state) => {
      const activeLines = activeCursorLineSet(state)
      const index = buildVaultDocumentIndex(state, onChangeProperties)
      return { activeLines, index, decorations: buildReferenceDecorations(state, index, activeLines) }
    },
    update: (value, transaction) => {
      const activeLines = activeCursorLineSet(transaction.state)
      if (shouldReuseVaultDecorations(transaction.docChanged, activeLines, value.activeLines)) return value

      const index = transaction.docChanged && shouldRebuildVaultDocumentIndex(
        (() => {
          const changes: VaultIndexChange[] = []
          transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => changes.push({ from: fromA, to: toA, inserted: inserted.toString() }))
          return changes
        })(),
        [...value.index.blocks, ...value.index.references, ...value.index.wikiLinks],
      )
        ? buildVaultDocumentIndex(transaction.state, onChangeProperties)
        : transaction.docChanged
          ? mapVaultDocumentIndex(value.index, transaction)
          : value.index

      return { activeLines, index, decorations: buildReferenceDecorations(transaction.state, index, activeLines) }
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  })

  return [
    referenceField,
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const target = event.target as HTMLElement | null
        const block = target?.closest<HTMLElement>('[data-vault-block-from]')
        if (block) {
          if (target?.closest<HTMLElement>('.vault-property-input, .vault-property-remove')) return false
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
        if (!wikiLink || !wikiResolverRef.current?.resolve(wikiLink.target)) return false
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
  onChangeProperties: (entries: Array<{ key: string; value: string }>) => void
  onActivateReference: (reference: VaultReferenceRange) => void
  workspaceSlug: string | null
}

interface VaultCaretAnchor {
  left: number
  bottom: number
}

function isUsableRect(rect: DOMRect | undefined): boolean {
  if (!rect) return false
  return rect.width > 0 || rect.height > 0 || rect.left > 0 || rect.top > 0
}

/** Resolves the caret viewport position, preferring CodeMirror's own geometry. */
export function getEditorCaretAnchor(view: EditorView | null, host: HTMLElement): VaultCaretAnchor {
  if (view) {
    try {
      const coords = view.coordsAtPos(view.state.selection.main.head)
      if (coords) return { left: coords.left, bottom: coords.bottom }
    } catch {
      // Fall through to DOM-based measurement below.
    }
  }

  const selection = window.getSelection()
  if (selection?.rangeCount && selection.anchorNode && host.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if (isUsableRect(rect)) return { left: rect.left, bottom: rect.bottom }
  }

  const cursorRect = host.querySelector<HTMLElement>('.cm-cursor')?.getBoundingClientRect()
  if (isUsableRect(cursorRect)) return { left: cursorRect!.left, bottom: cursorRect!.bottom }

  // Anchor inside the editor instead of collapsing to the viewport origin.
  const hostRect = host.getBoundingClientRect()
  return { left: hostRect.left + 16, bottom: hostRect.top + 40 }
}

const vaultReferenceTypeLabels: Record<VaultReferenceType, string> = {
  skill: 'Skill',
  mcp: 'MCP',
  session: '会话',
  todo: '待办',
  calendar_event: '日程',
}

const vaultReferenceOpenHints: Record<VaultReferenceType, string> = {
  skill: '点击在右侧打开 Skill 编辑页',
  mcp: '点击打开 MCP 页面',
  session: '点击打开对应会话',
  todo: '点击定位到对应待办',
  calendar_event: '点击定位到对应日程',
}

const vaultReferenceMenuLabels: Record<VaultReferenceType | 'all', string> = {
  skill: '调用 skill',
  mcp: 'MCP 服务',
  session: '会话',
  todo: '待办',
  calendar_event: '日程',
  all: 'Proma 引用',
}

function renderVaultReferenceChoice(choice: VaultReferenceChoice): React.ReactNode {
  const Icon = choice.reference.type === 'skill'
    ? Sparkles
    : choice.reference.type === 'mcp'
      ? Server
      : choice.reference.type === 'session'
        ? MessageSquareText
        : choice.reference.type === 'todo'
          ? ListTodo
          : CalendarDays
  const iconClass = choice.reference.type === 'skill'
    ? 'text-violet-500'
    : choice.reference.type === 'mcp'
      ? 'text-primary'
      : choice.reference.type === 'session'
        ? 'text-sky-500'
        : choice.reference.type === 'todo'
          ? 'text-amber-600'
          : 'text-cyan-600'
  return (
    <>
      <Icon className={`size-3.5 shrink-0 ${iconClass}`} />
      <span className="min-w-0 flex-1 truncate font-medium">{choice.reference.label}</span>
      <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/50">{choice.description}</span>
    </>
  )
}

const vaultReferenceTriggers: VaultReferenceTrigger[] = ['/', '#', '&', '~', '～', '*']

/** Triggers only fire at a word start so ordinary Markdown typing is untouched. */
export function isVaultTriggerContext(charBefore: string): boolean {
  return charBefore === '' || /\s/.test(charBefore)
}

/** Keeps normal Markdown input usable: `# `, `**bold**` and multi-line text dismiss the popup. */
export function shouldCloseVaultSuggestion(query: string): boolean {
  if (query === '') return false
  if (/[\r\n]/.test(query)) return true
  if (/^\s/.test(query)) return true
  return vaultReferenceTriggers.some((trigger) => query.includes(trigger))
}

/** Wraps around so keyboard navigation matches the main composer's suggestion list. */
export function nextSuggestionIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0
  return (((current + direction) % count) + count) % count
}

export function clampSuggestionPosition(anchor: VaultCaretAnchor): { left: number; top: number } {
  return {
    left: Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - 316)),
    top: Math.min(Math.max(8, anchor.bottom + 6), Math.max(8, window.innerHeight - 300)),
  }
}

interface VaultMeasureView {
  requestMeasure: () => void
}

/**
 * Coalesces layout invalidations into the next animation frame. This lets
 * CodeMirror read the final flex/transition geometry rather than a transient
 * zero-width side-panel layout, without introducing a coordinate offset.
 */
export function createVaultEditorMeasureScheduler(
  getView: () => VaultMeasureView | null,
  scheduleFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
): { request: () => void; dispose: () => void } {
  let frame: number | null = null

  return {
    request: () => {
      if (frame !== null) return
      frame = scheduleFrame(() => {
        frame = null
        getView()?.requestMeasure()
      })
    },
    dispose: () => {
      if (frame === null) return
      cancelFrame(frame)
      frame = null
    },
  }
}

export const VaultLiveMarkdownEditor = React.forwardRef<VaultLiveMarkdownEditorHandle, VaultLiveMarkdownEditorProps>(function VaultLiveMarkdownEditor({
  value,
  files,
  onChange,
  onSave,
  onOpenWikiLink,
  onEditReference,
  onChangeProperties,
  onActivateReference,
  workspaceSlug,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const onOpenWikiLinkRef = React.useRef(onOpenWikiLink)
  const onEditReferenceRef = React.useRef(onEditReference)
  const onChangePropertiesRef = React.useRef(onChangeProperties)
  const onActivateReferenceRef = React.useRef(onActivateReference)
  const workspaceSlugRef = React.useRef(workspaceSlug)
  const [suggestion, setSuggestion] = React.useState<{ trigger: VaultReferenceTrigger; type: VaultReferenceType | 'all'; query: string; from: number; left: number; top: number } | null>(null)
  const [suggestionItems, setSuggestionItems] = React.useState<VaultReferenceChoice[]>([])
  const suggestionListRef = React.useRef<MentionListRef>(null)
  const [chipTooltip, setChipTooltip] = React.useState<{ title: string; hint: string; left: number; top: number } | null>(null)
  const suggestionRef = React.useRef(suggestion)
  suggestionRef.current = suggestion
  const filesRef = React.useRef(files)
  const wikiResolverRef = React.useRef<VaultWikiLinkResolver | null>(null)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onOpenWikiLinkRef.current = onOpenWikiLink
  onEditReferenceRef.current = onEditReference
  onChangePropertiesRef.current = onChangeProperties
  onActivateReferenceRef.current = onActivateReference
  workspaceSlugRef.current = workspaceSlug
  if (!wikiResolverRef.current || filesRef.current !== files) {
    filesRef.current = files
    wikiResolverRef.current = createVaultWikiLinkResolver(files)
  }

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const showTooltip = (event: MouseEvent): void => {
      const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.vault-reference-chip')
      if (!chip) return
      const type = chip.dataset.referenceType as VaultReferenceType | undefined
      if (!type || !vaultReferenceTypeLabels[type]) return
      const rect = chip.getBoundingClientRect()
      setChipTooltip({
        title: `${vaultReferenceTypeLabels[type]} · ${chip.dataset.referenceLabel ?? ''}`,
        hint: `${vaultReferenceOpenHints[type]} · Option 点击重新选择`,
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 288)),
        top: Math.max(8, rect.top - 8),
      })
    }
    const hideTooltip = (event: MouseEvent): void => {
      const nextTarget = event.relatedTarget as HTMLElement | null
      if (nextTarget?.closest('.vault-reference-chip')) return
      setChipTooltip(null)
    }
    host.addEventListener('mouseover', showTooltip)
    host.addEventListener('mouseout', hideTooltip)
    return () => {
      host.removeEventListener('mouseover', showTooltip)
      host.removeEventListener('mouseout', hideTooltip)
    }
  }, [])

  const suggestionRequestRef = React.useRef(createLatestDebouncedRequest(
    ({ type, query, workspaceSlug }: { type: VaultReferenceType | 'all'; query: string; workspaceSlug: string | null }) => loadVaultReferenceChoices(type, query, workspaceSlug),
  ))

  React.useEffect(() => {
    if (!suggestion) {
      suggestionRequestRef.current.cancel()
      setSuggestionItems([])
      return
    }
    suggestionRequestRef.current.request(
      { type: suggestion.type, query: suggestion.query, workspaceSlug: workspaceSlugRef.current },
      setSuggestionItems,
      () => setSuggestionItems([]),
    )
    return () => suggestionRequestRef.current.cancel()
  }, [suggestion?.type, suggestion?.query, suggestion?.from])

  React.useEffect(() => {
    if (!suggestion) return
    const updateAnchor = (): void => {
      const host = hostRef.current
      if (!host) return
      const { left, top } = clampSuggestionPosition(getEditorCaretAnchor(viewRef.current, host))
      setSuggestion((current) => current ? { ...current, left, top } : current)
    }
    const scroller = hostRef.current?.querySelector<HTMLElement>('.cm-scroller')
    scroller?.addEventListener('scroll', updateAnchor, { passive: true })
    window.addEventListener('resize', updateAnchor)
    return () => {
      scroller?.removeEventListener('scroll', updateAnchor)
      window.removeEventListener('resize', updateAnchor)
    }
  }, [suggestion?.from])

  const selectSuggestion = React.useCallback((choice: VaultReferenceChoice): void => {
    const current = suggestionRef.current
    const view = viewRef.current
    if (!current || !view) return
    const marker = serializeVaultReference(choice.reference)
    // Replace the typed trigger and query so the raw symbol never lingers in the note.
    const to = Math.max(current.from, view.state.selection.main.head)
    view.dispatch({
      changes: { from: current.from, to, insert: marker },
      selection: { anchor: current.from + marker.length },
    })
    setSuggestion(null)
    view.focus()
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
        Prec.highest(keymap.of([
          {
            key: 'Escape',
            run: () => {
              if (!suggestionRef.current) return false
              setSuggestion(null)
              return true
            },
          },
          {
            key: 'ArrowDown',
            run: () => {
              if (!suggestionRef.current) return false
              suggestionListRef.current?.onKeyDown({ event: { key: 'ArrowDown' } as KeyboardEvent })
              return true
            },
          },
          {
            key: 'ArrowUp',
            run: () => {
              if (!suggestionRef.current) return false
              suggestionListRef.current?.onKeyDown({ event: { key: 'ArrowUp' } as KeyboardEvent })
              return true
            },
          },
          {
            key: 'Enter',
            run: () => {
              if (!suggestionRef.current) return false
              return suggestionListRef.current?.onKeyDown({ event: { key: 'Enter' } as KeyboardEvent }) ?? false
            },
          },
          {
            key: 'Tab',
            run: () => {
              if (!suggestionRef.current) return false
              return suggestionListRef.current?.onKeyDown({ event: { key: 'Enter' } as KeyboardEvent }) ?? false
            },
          },
        ])),
        ViewPlugin.define((view) => {
          viewRef.current = view
          return {
            destroy: () => {
              if (viewRef.current === view) viewRef.current = null
            },
          }
        }),
        EditorView.updateListener.of((update) => {
          const current = suggestionRef.current
          if (!current) {
            if (!update.docChanged) return
            let opened = false
            update.changes.iterChanges((fromA, toA, _fromB, toB, inserted) => {
              if (opened || fromA !== toA) return
              const trigger = vaultReferenceTriggers.find((candidate) => candidate === inserted.toString())
              if (!trigger) return
              const type = trigger === '*' ? 'all' : vaultReferenceTypeForTrigger(trigger)
              if (!type) return
              const from = toB - trigger.length
              if (update.state.selection.main.head !== toB) return
              if (!isVaultTriggerContext(from > 0 ? update.state.doc.sliceString(from - 1, from) : '')) return
              const anchor = clampSuggestionPosition(getEditorCaretAnchor(update.view, host))
              setSuggestion({ trigger, type, query: '', from, left: anchor.left, top: anchor.top })
              opened = true
            })
            return
          }
          if (!update.docChanged && !update.selectionSet) return
          const head = update.state.selection.main.head
          const typed = head > current.from ? update.state.doc.sliceString(current.from, head) : ''
          if (!typed.startsWith(current.trigger)) {
            setSuggestion(null)
            return
          }
          const query = typed.slice(current.trigger.length)
          if (shouldCloseVaultSuggestion(query)) {
            setSuggestion(null)
            return
          }
          const { left, top } = clampSuggestionPosition(getEditorCaretAnchor(update.view, host))
          setSuggestion((previous) => previous ? { ...previous, query, left, top } : previous)
        }),
        ...markdownSyntaxVisibility,
        ...vaultShikiCodeHighlight,
        ...createVaultReferenceExtension({
          onActivateReference: (reference) => onActivateReferenceRef.current(reference),
          onOpenWikiLink: (target) => onOpenWikiLinkRef.current(target),
          onEditReference: (reference) => onEditReferenceRef.current(reference),
          onChangeProperties: (entries) => onChangePropertiesRef.current(entries),
          wikiResolverRef,
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
      }
    }
    host.addEventListener('keydown', onKeyDown)

    // A right SidePanel can mount the editor at zero width and then reveal it through
    // a width transition. ResizeObserver alone can fire while flex layout is still
    // settling, leaving CodeMirror's wrapped-line height map stale for hit testing.
    const measureScheduler = createVaultEditorMeasureScheduler(() => viewRef.current)
    const resizeObserver = new ResizeObserver(measureScheduler.request)
    const onTransitionEnd = (event: TransitionEvent): void => {
      const target = event.target
      if (
        (event.propertyName === 'width' || event.propertyName === 'height')
        && target instanceof Element
        && target.contains(host)
      ) measureScheduler.request()
    }
    resizeObserver.observe(host)
    // The width transition runs on SidePanel, an ancestor of the editor, so listen at
    // window and accept only transitions whose target contains this host.
    window.addEventListener('transitionend', onTransitionEnd)
    measureScheduler.request()

    return () => {
      disposed = true
      ready = false
      resizeObserver.disconnect()
      measureScheduler.dispose()
      window.removeEventListener('transitionend', onTransitionEnd)
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
    <div ref={hostRef} className="vault-ink-mde scrollbar-thin relative h-full min-h-0 [&_.ink-mde]:h-full [&_.ink-mde-editor]:min-h-0">
      {chipTooltip && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[110] max-w-[280px] -translate-y-full rounded-md bg-popover px-2.5 py-1.5 shadow-lg ring-1 ring-border/60"
          style={{ left: chipTooltip.left, top: chipTooltip.top }}
        >
          <p className="truncate text-[12px] font-medium text-foreground">{chipTooltip.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{chipTooltip.hint}</p>
        </div>,
        document.body,
      )}
      {suggestion && createPortal(
        <div className="fixed z-[100]" style={{ left: suggestion.left, top: suggestion.top }}>
          <MentionList
            ref={suggestionListRef}
            items={suggestionItems}
            onSelect={selectSuggestion}
            emptyText="没有匹配的引用"
            headerLabel={vaultReferenceMenuLabels[suggestion.type]}
            keyExtractor={(choice) => `${choice.reference.type}:${choice.reference.id}`}
            renderItem={renderVaultReferenceChoice}
          />
        </div>,
        document.body,
      )}
    </div>
  )
})
