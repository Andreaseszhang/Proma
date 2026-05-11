/**
 * Read 工具结果渲染器 — @pierre/diffs File 版本
 *
 * 使用 @pierre/diffs 的 File 组件渲染代码预览，
 * 带 Shiki 语法高亮、行号、与 diff 视图一致的主题风格。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { File as PierreFile } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { resolvedThemeAtom } from '@/atoms/theme'
import { CollapsibleResult } from './collapsible-result'
import { PIERRE_FILE_CSS } from './pierre-styles'

interface ReadResultRendererProps {
  result: string
  isError: boolean
  input: Record<string, unknown>
}

export function ReadResultRenderer({ result, isError, input }: ReadResultRendererProps): React.ReactElement {
  const theme = useAtomValue(resolvedThemeAtom)
  const filePath = typeof input.file_path === 'string'
    ? input.file_path
    : typeof input.filePath === 'string'
      ? (input.filePath as string)
      : ''

  const renderCode = React.useCallback((text: string): React.ReactNode => {
    if (isError) {
      return (
        <pre className="rounded-md p-3 text-[12px] font-mono text-destructive/80 bg-destructive/5 whitespace-pre-wrap break-all overflow-x-auto">
          {text}
        </pre>
      )
    }

    const file: FileContents = {
      name: filePath || 'file',
      contents: text,
    }

    const options = {
      theme: { dark: 'one-dark-pro' as const, light: 'one-light' as const },
      disableFileHeader: true,
      overflow: 'scroll' as const,
      themeType: theme as 'light' | 'dark' | 'system',
      unsafeCSS: PIERRE_FILE_CSS,
    }

    return (
      <div className="rounded-md overflow-hidden bg-content-area">
        <PierreFile file={file} options={options} />
      </div>
    )
  }, [isError, filePath, theme])

  return (
    <CollapsibleResult
      content={result}
      renderContent={renderCode}
    />
  )
}
