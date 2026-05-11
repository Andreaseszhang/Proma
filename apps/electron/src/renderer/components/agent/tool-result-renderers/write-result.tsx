/**
 * Write 工具结果渲染器 — @pierre/diffs 版本
 *
 * 新建文件时以 pierre diff 显示全部新增行（old 为空）。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { MultiFileDiff } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { resolvedThemeAtom } from '@/atoms/theme'
import { agentDiffStyleAtom } from '@/atoms/ui-preferences'
import { FilePathChip } from '@/components/ai-elements/file-path-chip'
import { PIERRE_DIFF_CSS } from './pierre-styles'

interface WriteResultRendererProps {
  result: string
  isError: boolean
  input: Record<string, unknown>
}

export function WriteResultRenderer({ result, isError, input }: WriteResultRendererProps): React.ReactElement {
  const theme = useAtomValue(resolvedThemeAtom)
  const diffStyle = useAtomValue(agentDiffStyleAtom)

  if (isError) {
    return (
      <pre className="rounded-md p-3 text-[12px] font-mono text-destructive/80 bg-destructive/5 whitespace-pre-wrap break-all overflow-x-auto">
        {result}
      </pre>
    )
  }

  const content = typeof input.content === 'string' ? input.content : ''
  const filePath = typeof input.file_path === 'string' ? input.file_path : ''

  if (!content) {
    return (
      <div className="text-[12px] text-muted-foreground flex items-center gap-1">
        已写入 {filePath ? <FilePathChip filePath={filePath} /> : <span className="font-mono text-foreground/70">文件</span>}
      </div>
    )
  }

  const oldFile: FileContents = { name: filePath || 'new-file', contents: '' }
  const newFile: FileContents = { name: filePath || 'new-file', contents: content }

  const options = {
    diffStyle,
    theme: { dark: 'one-dark-pro' as const, light: 'one-light' as const },
    disableFileHeader: true,
    diffIndicators: 'bars' as const,
    hunkSeparators: 'line-info' as const,
    lineDiffType: 'none' as const,
    overflow: 'scroll' as const,
    themeType: theme as 'light' | 'dark' | 'system',
    unsafeCSS: PIERRE_DIFF_CSS,
  }

  return (
    <div className="rounded-md overflow-hidden bg-content-area max-h-[400px] overflow-y-auto">
      <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} />
    </div>
  )
}
