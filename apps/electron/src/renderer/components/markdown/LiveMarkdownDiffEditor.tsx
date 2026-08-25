import * as React from 'react'
import { cn } from '@/lib/utils'
import { LiveMarkdownEditor, type LiveMarkdownEditorProps } from './LiveMarkdownEditor'

export interface LiveMarkdownDiffEditorProps extends Omit<LiveMarkdownEditorProps, 'className' | 'diffReview' | 'value' | 'onChange'> {
  /** Immutable content from before the reviewed change. */
  beforeValue: string
  /** Immutable content immediately after the reviewed change. */
  diffValue: string
  /** Current editable source. */
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * One editable Markdown surface with stable inline Diff decorations.
 * Added lines remain editable and deleted lines are rendered as non-editable
 * virtual rows, so review and editing never switch between separate visual modes.
 */
export function LiveMarkdownDiffEditor({
  beforeValue,
  diffValue,
  value,
  onChange,
  className,
  ...editorProps
}: LiveMarkdownDiffEditorProps): React.ReactElement {
  return (
    <LiveMarkdownEditor
      key={`${beforeValue}\u0000${diffValue}`}
      {...editorProps}
      value={value}
      onChange={onChange}
      diffReview={{ beforeValue, afterValue: diffValue }}
      className={cn('h-full min-h-0 overflow-hidden rounded-lg border border-border/60 bg-content-area', className)}
    />
  )
}
