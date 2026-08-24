import * as React from 'react'
import ink, { type Instance } from 'ink-mde'
import { cn } from '@/lib/utils'
import { createMarkdownEditorLifecycle } from './markdown-editor-lifecycle'
import { markdownSyntaxVisibility } from './markdown-syntax-visibility'

export interface LiveMarkdownEditorSelection {
  start: number
  end: number
}

export interface LiveMarkdownEditorScrollPosition {
  top: number
  left: number
}

export interface LiveMarkdownEditorHandle {
  focus: () => void
  getInstance: () => Instance | null
}

export interface LiveMarkdownEditorProps {
  /** Controlled value. When omitted, the editor manages its initial defaultValue. */
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  onSave?: () => void
  onSelectionChange?: (selection: LiveMarkdownEditorSelection) => void
  onScrollPositionChange?: (position: LiveMarkdownEditorScrollPosition) => void
}

export const LiveMarkdownEditor = React.forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(function LiveMarkdownEditor({
  value,
  defaultValue = '',
  onChange,
  readOnly = false,
  placeholder,
  className,
  onSave,
  onSelectionChange,
  onScrollPositionChange,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const lifecycleRef = React.useRef<ReturnType<typeof createMarkdownEditorLifecycle> | null>(null)
  const valueRef = React.useRef(value ?? defaultValue)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  const onSelectionChangeRef = React.useRef(onSelectionChange)
  const onScrollPositionChangeRef = React.useRef(onScrollPositionChange)
  const placeholderRef = React.useRef(placeholder)
  const readOnlyRef = React.useRef(readOnly)
  valueRef.current = value ?? valueRef.current
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onSelectionChangeRef.current = onSelectionChange
  onScrollPositionChangeRef.current = onScrollPositionChange
  placeholderRef.current = placeholder
  readOnlyRef.current = readOnly

  React.useImperativeHandle(ref, () => ({
    focus: () => instanceRef.current?.focus(),
    getInstance: () => instanceRef.current,
  }), [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // ink-mde leaves its rendered container behind on destroy. An owned child
    // mount prevents StrictMode's discarded effect from becoming an empty shell.
    const mount = document.createElement('div')
    mount.className = 'h-full min-h-0'
    host.appendChild(mount)
    const lifecycle = createMarkdownEditorLifecycle((initialValue, handleUpdate) => ink(mount, {
      doc: initialValue,
      placeholder: placeholderRef.current,
      files: { clipboard: false, dragAndDrop: false, injectMarkup: true },
      hooks: { afterUpdate: handleUpdate },
      interface: {
        appearance: 'auto',
        attribution: false,
        autocomplete: false,
        images: false,
        lists: true,
        readonly: readOnlyRef.current,
        spellcheck: false,
        toolbar: false,
      },
      plugins: markdownSyntaxVisibility.map((extension) => ({ type: 'default' as const, value: extension })),
      search: false,
      toolbar: {
        bold: false, code: false, codeBlock: false, heading: false, image: false,
        italic: false, link: false, list: false, orderedList: false, quote: false,
        taskList: false, upload: false,
      },
    }), (nextValue) => onChangeRef.current?.(nextValue))
    lifecycleRef.current = lifecycle
    lifecycle.mount(valueRef.current)

    let frame = 0
    let cancelled = false
    const reportSelection = (): void => {
      frame = 0
      const selection = instanceRef.current?.selections()[0]
      if (selection) onSelectionChangeRef.current?.({ start: selection.start, end: selection.end })
    }
    const scheduleSelectionReport = (): void => {
      if (!frame) frame = requestAnimationFrame(reportSelection)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveRef.current?.()
      }
    }
    const handleScroll = (event: Event): void => {
      const target = event.target
      if (target instanceof HTMLElement) onScrollPositionChangeRef.current?.({ top: target.scrollTop, left: target.scrollLeft })
    }
    const attachInstance = (): void => {
      if (cancelled) return
      instanceRef.current = lifecycle.getInstance() as Instance | null
      if (!instanceRef.current) {
        requestAnimationFrame(attachInstance)
        return
      }
      instanceRef.current.reconfigure({
        placeholder: placeholderRef.current,
        interface: { readonly: readOnlyRef.current },
      })
    }
    host.addEventListener('keydown', handleKeyDown)
    host.addEventListener('keyup', scheduleSelectionReport)
    host.addEventListener('mouseup', scheduleSelectionReport)
    host.addEventListener('scroll', handleScroll, true)
    attachInstance()

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      host.removeEventListener('keydown', handleKeyDown)
      host.removeEventListener('keyup', scheduleSelectionReport)
      host.removeEventListener('mouseup', scheduleSelectionReport)
      host.removeEventListener('scroll', handleScroll, true)
      lifecycle.dispose()
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null
      instanceRef.current = null
      mount.remove()
    }
  // The editor lifecycle is intentionally created once. Prop updates use the effects below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (value !== undefined) {
      valueRef.current = value
      lifecycleRef.current?.sync(value)
    }
  }, [value])

  React.useEffect(() => {
    instanceRef.current?.reconfigure({
      placeholder,
      interface: { readonly: readOnly },
    })
  }, [placeholder, readOnly])

  return <div ref={hostRef} className={cn('markdown-live-editor h-full min-h-0', className)} />
})
