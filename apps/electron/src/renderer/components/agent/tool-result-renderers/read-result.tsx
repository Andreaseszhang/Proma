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

const CAT_N_LINE_RE = /^\s*\d+\t/

/** 检测并去除 cat -n 格式行号前缀（"    1\tcontent" → "content"） */
function stripCatLineNumbers(text: string): string {
  const lines = text.split('\n')
  if (lines.length < 2) return text
  // 只在前几行都匹配 cat -n 格式时才 strip，避免误伤普通内容
  const sample = lines.slice(0, Math.min(5, lines.length))
  const allMatch = sample.every(line => line === '' || CAT_N_LINE_RE.test(line))
  if (!allMatch) return text
  return lines.map(line => line.replace(CAT_N_LINE_RE, '')).join('\n')
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

    // Claude Agent SDK Read 工具返回 cat -n 格式（"    1\tcontent"），
    // 需要 strip 行号前缀，否则与 PierreFile 自身行号重复
    const stripped = stripCatLineNumbers(text)

    const file: FileContents = {
      name: filePath || 'file',
      contents: stripped,
      cacheKey: `read:${filePath}:${stripped.length}:${stripped.slice(0, 32)}`,
    }

    const options = {
      theme: { dark: 'one-dark-pro' as const, light: 'one-light' as const },
      disableFileHeader: true,
      overflow: 'scroll' as const,
      themeType: theme as 'light' | 'dark' | 'system',
      unsafeCSS: PIERRE_FILE_CSS,
    }

    return (
      <div className="rounded-md overflow-x-hidden overflow-y-auto bg-content-area max-h-[400px]">
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
