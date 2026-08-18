import * as React from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { hybridMarkdown } from 'codemirror-markdown-hybrid'

interface VaultLiveMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export function VaultLiveMarkdownEditor({
  value,
  onChange,
  onSave,
}: VaultLiveMarkdownEditorProps): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.lineWrapping,
          hybridMarkdown({
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            enableCollapse: false,
          }),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: host,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  // The editor owns its state after initialization; external file reloads use the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return <div ref={hostRef} className="vault-hybrid-markdown h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:font-sans [&_.cm-content]:min-h-full [&_.cm-content]:px-4 [&_.cm-content]:py-3 [&_.cm-content]:text-[length:var(--md-preview-font-size,15px)] [&_.cm-content]:leading-relaxed [&_.cm-gutters]:hidden" />
}
