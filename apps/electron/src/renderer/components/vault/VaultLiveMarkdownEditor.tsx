import * as React from 'react'
import type { VaultFileEntry } from '@proma/shared'
import {
  LiveMarkdownEditor,
  type LiveMarkdownEditorHandle,
} from '@/components/markdown/LiveMarkdownEditor'
import type {
  VaultReference,
  VaultReferenceRange,
} from './vault-reference-utils'

/** @deprecated Use LiveMarkdownEditorHandle for new consumers. */
export interface VaultLiveMarkdownEditorHandle extends LiveMarkdownEditorHandle {
  insertReference: (_reference: VaultReference) => void
}

interface VaultLiveMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  /** Legacy Vault-specific inputs are retained temporarily for call-site compatibility. */
  files: VaultFileEntry[]
  workspaceSlug: string | null
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  onChangeProperties: (entries: Array<{ key: string; value: string }>) => void
  onActivateReference: (reference: VaultReferenceRange) => void
}

/**
 * Vault's thin file adapter around the reusable LiveMarkdownEditor. Proma
 * references, linked domain objects and Vault-only widgets deliberately no
 * longer participate in ordinary Markdown editing.
 */
export const VaultLiveMarkdownEditor = React.forwardRef<VaultLiveMarkdownEditorHandle, VaultLiveMarkdownEditorProps>(function VaultLiveMarkdownEditor({
  value,
  onChange,
  onSave,
}, ref): React.ReactElement {
  const editorRef = React.useRef<LiveMarkdownEditorHandle>(null)

  React.useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insert: (text) => editorRef.current?.insert(text),
    getHost: () => editorRef.current?.getHost() ?? null,
    getView: () => editorRef.current?.getView() ?? null,
    insertReference: () => {},
  }), [])

  return (
    <LiveMarkdownEditor
      ref={editorRef}
      value={value}
      onChange={onChange}
      onSave={onSave}
      className="vault-ink-mde scrollbar-thin relative h-full min-h-0 [&_.ink-mde]:h-full [&_.ink-mde-editor]:min-h-0"
    />
  )
})
