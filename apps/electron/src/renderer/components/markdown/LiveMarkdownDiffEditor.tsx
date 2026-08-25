import * as React from 'react'
import { FileDiff } from '@pierre/diffs/react'
import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from '@pierre/diffs'
import { useAtomValue } from 'jotai'
import { resolvedThemeAtom } from '@/atoms/theme'
import { cn } from '@/lib/utils'
import { LiveMarkdownEditor, type LiveMarkdownEditorProps } from './LiveMarkdownEditor'
import { canRenderMarkdownDiff, countMarkdownLines } from './live-markdown-diff-editor-utils'

const MARKDOWN_DIFF_CSS = `
  :root, :host {
    --diffs-bg: transparent;
    --diffs-addition-base: rgb(67,167,71);
    --diffs-deletion-base: rgb(206,66,52);
    --diffs-addition-bg: light-dark(rgb(228,244,233), rgb(19,34,23));
    --diffs-deletion-bg: light-dark(rgb(248,231,230), rgb(39,22,20));
    --diffs-separator-bg: hsl(var(--background));
  }
  [data-line-type=change-addition] { background-color: var(--diffs-addition-bg) !important; }
  [data-line-type=change-deletion] { background-color: var(--diffs-deletion-bg) !important; }
  [data-line-type=change-addition] [data-column-number] { color: rgb(67,167,71) !important; background-color: var(--diffs-addition-bg) !important; }
  [data-line-type=change-deletion] [data-column-number] { color: rgb(206,66,52) !important; background-color: var(--diffs-deletion-bg) !important; }
  [data-gutter-buffer=buffer] { background: none !important; }
  [data-line-type=context] [data-column-number], [data-line-type=metadata] [data-column-number], [data-line-type=expanded] [data-column-number], [data-gutter] { background-color: hsl(var(--content-area)) !important; }
`

function cheapHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0
  }
  return hash >>> 0
}

export interface LiveMarkdownDiffEditorProps extends Omit<LiveMarkdownEditorProps, 'className' | 'value' | 'onChange'> {
  /** Immutable content from before the reviewed change. */
  beforeValue: string
  /** Immutable content immediately after the reviewed change. Kept separate from value to avoid recomputing Diff while typing. */
  diffValue: string
  /** Current editable source. */
  value: string
  onChange: (value: string) => void
  fileName: string
  className?: string
  diffLabel?: string
  editorLabel?: string
}

/**
 * A source-preserving Markdown editor paired with a stable, full-height review Diff.
 * The Diff deliberately compares beforeValue → diffValue instead of the live editable
 * value, so Shiki/Myers work never runs on each keystroke.
 */
export function LiveMarkdownDiffEditor({
  beforeValue,
  diffValue,
  value,
  onChange,
  fileName,
  className,
  diffLabel = '本次变更',
  editorLabel = '直接编辑',
  ...editorProps
}: LiveMarkdownDiffEditorProps): React.ReactElement {
  const theme = useAtomValue(resolvedThemeAtom)
  const oldLines = React.useMemo(() => countMarkdownLines(beforeValue), [beforeValue])
  const newLines = React.useMemo(() => countMarkdownLines(diffValue), [diffValue])
  const tooLarge = !canRenderMarkdownDiff(beforeValue, diffValue)

  const oldFile = React.useMemo<FileContents>(() => ({
    name: fileName,
    contents: beforeValue,
    cacheKey: `before:${fileName}:${cheapHash(beforeValue)}`,
  }), [beforeValue, fileName])
  const newFile = React.useMemo<FileContents>(() => ({
    name: fileName,
    contents: diffValue,
    cacheKey: `after:${fileName}:${cheapHash(diffValue)}`,
  }), [diffValue, fileName])
  const options = React.useMemo(() => ({
    diffStyle: 'unified' as const,
    theme: { dark: 'one-dark-pro' as const, light: 'one-light' as const },
    disableFileHeader: true,
    diffIndicators: 'bars' as const,
    hunkSeparators: 'line-info' as const,
    lineDiffType: 'none' as const,
    overflow: 'scroll' as const,
    themeType: theme as 'light' | 'dark' | 'system',
    unsafeCSS: MARKDOWN_DIFF_CSS,
  }), [theme])
  const fileDiff = React.useMemo<FileDiffMetadata | null>(() => {
    if (tooLarge || beforeValue === diffValue) return null
    try {
      return parseDiffFromFile(oldFile, newFile)
    } catch {
      return null
    }
  }, [beforeValue, diffValue, newFile, oldFile, tooLarge])

  return (
    <div className={cn('grid h-full min-h-0 grid-cols-2 divide-x divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-content-area', className)}>
      <section className="flex min-h-0 flex-col" aria-label={diffLabel}>
        <div className="shrink-0 border-b border-border/60 px-3 py-2 text-xs font-medium text-foreground">{diffLabel}</div>
        {tooLarge ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
            文件超过 Diff 渲染上限（{Math.max(oldLines, newLines).toLocaleString()} 行）。仍可在右侧直接编辑。
          </div>
        ) : fileDiff ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <FileDiff fileDiff={fileDiff} options={options} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">本次没有可显示的文本差异。</div>
        )}
      </section>
      <section className="flex min-h-0 flex-col" aria-label={editorLabel}>
        <div className="shrink-0 border-b border-border/60 px-3 py-2 text-xs font-medium text-foreground">{editorLabel}</div>
        <LiveMarkdownEditor {...editorProps} value={value} onChange={onChange} className="flex-1" />
      </section>
    </div>
  )
}
