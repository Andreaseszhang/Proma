export const markdownSyntaxMarkerNames = new Set([
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'QuoteMark',
])

export type MarkdownBlockKind = 'table' | 'mermaid' | 'thematic_break'

export interface MarkdownBlockMatch {
  kind: MarkdownBlockKind
  startLine: number
  endLine: number
}

export interface DisposableInstance {
  destroy: () => void
}

/** Keeps async editor initialization harmless when React discards an effect run. */
export function createAsyncInstanceLifecycle<T extends DisposableInstance>(): {
  dispose: () => void
  instance: () => T | null
  settle: (instance: T) => boolean
} {
  let disposed = false
  let current: T | null = null

  return {
    dispose: () => {
      disposed = true
      current?.destroy()
      current = null
    },
    instance: () => current,
    settle: (instance) => {
      if (disposed) {
        instance.destroy()
        return false
      }
      current = instance
      return true
    },
  }
}

export function shouldHideMarkdownSyntax(
  markerName: string,
  markerLine: number,
  activeLines: ReadonlySet<number>,
  focused: boolean,
): boolean {
  return !focused || (markdownSyntaxMarkerNames.has(markerName) && !activeLines.has(markerLine))
}

export function splitMarkdownTableRow(line: string): string[] {
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

function isMermaidFence(info: string): boolean {
  return /^(?:mermaid|mmd)$/i.test(info.trim().split(/\s+/)[0] ?? '')
}

/** Recognizes rendered blocks while retaining all Markdown source in the document. */
export function detectMarkdownBlocks(markdown: string): MarkdownBlockMatch[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const matches: MarkdownBlockMatch[] = []

  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
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
      if (closingLine <= lines.length && isMermaidFence(fenceMatch[2] ?? '')) {
        matches.push({ kind: 'mermaid', startLine: lineNumber, endLine: closingLine })
      }
      if (closingLine <= lines.length) lineNumber = closingLine
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
    while (lastLine <= lines.length) {
      const candidate = lines[lastLine - 1] ?? ''
      if (!candidate.trim() || !candidate.includes('|')) break
      lastLine += 1
    }
    matches.push({ kind: 'table', startLine: lineNumber, endLine: lastLine - 1 })
    lineNumber = lastLine - 2
  }

  return matches
}
