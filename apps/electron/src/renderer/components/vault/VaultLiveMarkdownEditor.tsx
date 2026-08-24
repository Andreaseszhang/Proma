import * as React from 'react'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, StateEffect, StateField, type EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'
import ink, { type Instance } from 'ink-mde'
import {
  findVaultWikiLinkAt,
  parseVaultReferences,
  serializeVaultReference,
  type VaultReference,
  type VaultReferenceRange,
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
      if (!markdownSyntaxMarkerNames.has(type.name)) return
      if (activeLines.has(state.doc.lineAt(from).number)) return
      builder.add(from, to, hiddenMarkdownSyntax)
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

class VaultReferenceWidget extends WidgetType {
  constructor(
    private readonly reference: VaultReferenceRange,
    private readonly onEdit: (reference: VaultReferenceRange) => void,
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
    button.className = 'vault-reference-chip'
    button.textContent = `${this.reference.type === 'calendar_event' ? '日程' : this.reference.type === 'todo' ? '待办' : this.reference.type === 'session' ? '会话' : this.reference.type === 'skill' ? 'Skill' : 'MCP'}: ${this.reference.label}`
    button.title = '点击重新选择引用'
    button.addEventListener('click', () => this.onEdit(this.reference))
    return button
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function createVaultReferenceExtension({
  onOpenWikiLink,
  onEditReference,
}: {
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
}) {
  const referenceField = StateField.define<DecorationSet>({
    create: (state) => buildReferenceDecorations(state),
    update: (value, transaction) => {
      if (!transaction.docChanged && transaction.selection === undefined) return value
      return buildReferenceDecorations(transaction.state)
    },
    provide: (field) => EditorView.decorations.from(field),
  })

  function buildReferenceDecorations(state: EditorState): DecorationSet {
    const activeLines = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number))
    const builder = new RangeSetBuilder<Decoration>()
    for (const reference of parseVaultReferences(state.doc.toString())) {
      // 光标进入同一行时回退到原 Markdown + comment，保持可见且可直接编辑。
      if (activeLines.has(state.doc.lineAt(reference.from).number)) continue
      builder.add(reference.from, reference.to, Decoration.replace({ widget: new VaultReferenceWidget(reference, onEditReference) }))
    }
    return builder.finish()
  }

  return [
    referenceField,
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return false
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position === null) return false
        const wikiLink = findVaultWikiLinkAt(view.state.doc.toString(), position)
        if (!wikiLink) return false
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
  onChange: (value: string) => void
  onSave: () => void
  onOpenWikiLink: (target: string) => void
  onEditReference: (reference: VaultReferenceRange) => void
  onRequestReference: (type?: VaultReferenceType) => void
}

export const VaultLiveMarkdownEditor = React.forwardRef<VaultLiveMarkdownEditorHandle, VaultLiveMarkdownEditorProps>(function VaultLiveMarkdownEditor({
  value,
  onChange,
  onSave,
  onOpenWikiLink,
  onEditReference,
  onRequestReference,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const onOpenWikiLinkRef = React.useRef(onOpenWikiLink)
  const onEditReferenceRef = React.useRef(onEditReference)
  const onRequestReferenceRef = React.useRef(onRequestReference)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onOpenWikiLinkRef.current = onOpenWikiLink
  onEditReferenceRef.current = onEditReference
  onRequestReferenceRef.current = onRequestReference

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
        ...markdownSyntaxVisibility,
        ...createVaultReferenceExtension({
          onOpenWikiLink: (target) => onOpenWikiLinkRef.current(target),
          onEditReference: (reference) => onEditReferenceRef.current(reference),
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
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === '@') {
        event.preventDefault()
        onRequestReferenceRef.current()
      }
    }
    host.addEventListener('keydown', onKeyDown)

    return () => {
      disposed = true
      ready = false
      host.removeEventListener('keydown', onKeyDown)
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

  return <div ref={hostRef} className="vault-ink-mde h-full min-h-0 [&_.ink-mde]:h-full [&_.ink-mde-editor]:min-h-0 [&_.ink-mde-editor]:overflow-auto" />
})
