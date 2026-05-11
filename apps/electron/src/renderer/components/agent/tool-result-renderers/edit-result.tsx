/**
 * Edit 工具结果渲染器 — @pierre/diffs 版本
 *
 * 使用 @pierre/diffs MultiFileDiff 渲染 old_string → new_string 的差异，
 * 带 Shiki 语法高亮、行号，固定使用 unified 视图。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { MultiFileDiff } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { resolvedThemeAtom } from '@/atoms/theme'
import { PIERRE_DIFF_CSS } from './pierre-styles'

function cheapHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

interface EditResultRendererProps {
  result: string
  isError: boolean
  input: Record<string, unknown>
}

export function EditResultRenderer({ result, isError, input }: EditResultRendererProps): React.ReactElement {
  const theme = useAtomValue(resolvedThemeAtom)
  const oldStr = typeof input.old_string === 'string' ? input.old_string : ''
  const newStr = typeof input.new_string === 'string' ? input.new_string : ''
  const filePath = typeof input.file_path === 'string' ? input.file_path : 'file'

  const oldFile = React.useMemo<FileContents>(() => ({
    name: filePath,
    contents: oldStr,
    cacheKey: `old:${filePath}:${cheapHash(oldStr)}`,
  }), [filePath, oldStr])

  const newFile = React.useMemo<FileContents>(() => ({
    name: filePath,
    contents: newStr,
    cacheKey: `new:${filePath}:${cheapHash(newStr)}`,
  }), [filePath, newStr])

  const options = React.useMemo(() => ({
    diffStyle: 'unified' as const,
    theme: { dark: 'one-dark-pro' as const, light: 'one-light' as const },
    disableFileHeader: true,
    diffIndicators: 'bars' as const,
    hunkSeparators: 'line-info' as const,
    lineDiffType: 'none' as const,
    overflow: 'scroll' as const,
    themeType: theme as 'light' | 'dark' | 'system',
    unsafeCSS: PIERRE_DIFF_CSS,
  }), [theme])

  if (isError) {
    return (
      <pre className="rounded-md p-3 text-[12px] font-mono text-destructive/80 bg-destructive/5 whitespace-pre-wrap break-all overflow-x-auto">
        {result}
      </pre>
    )
  }

  if (!oldStr && !newStr) {
    return (
      <div className="text-[12px] text-muted-foreground">
        {result || '编辑成功'}
      </div>
    )
  }

  return (
    <div className="rounded-md overflow-x-hidden overflow-y-auto bg-content-area max-h-[400px]">
      <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} />
    </div>
  )
}
