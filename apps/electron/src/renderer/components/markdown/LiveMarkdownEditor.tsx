import * as React from 'react'
import { Prec, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap } from '@codemirror/view'
import ink, { type Instance } from 'ink-mde'
import { cn } from '@/lib/utils'

export interface LiveMarkdownEditorHandle {
  focus: () => void
  insert: (text: string) => void
  getHost: () => HTMLDivElement | null
  getView: () => EditorView | null
}

interface LiveMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  extensions?: readonly Extension[]
  className?: string
}

interface MeasureView {
  requestMeasure: () => void
}

function createMeasureScheduler(
  getView: () => MeasureView | null,
  scheduleFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
): { request: () => void; dispose: () => void } {
  let frame: number | null = null
  return {
    request: () => {
      if (frame !== null) return
      frame = scheduleFrame(() => {
        frame = null
        getView()?.requestMeasure()
      })
    },
    dispose: () => {
      if (frame === null) return
      cancelFrame(frame)
      frame = null
    },
  }
}

/**
 * Reusable ink-mde host. It owns only the editor lifecycle, controlled value,
 * save shortcut, sizing and cleanup; domain-specific Markdown behavior belongs
 * in the extensions supplied by each feature.
 */
export const LiveMarkdownEditor = React.forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(function LiveMarkdownEditor({
  value,
  onChange,
  onSave,
  extensions = [],
  className,
}, ref): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const instanceRef = React.useRef<Instance | null>(null)
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const onSaveRef = React.useRef(onSave)
  valueRef.current = value
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  React.useImperativeHandle(ref, () => ({
    focus: () => instanceRef.current?.focus(),
    insert: (text) => instanceRef.current?.insert(text),
    getHost: () => hostRef.current,
    getView: () => viewRef.current,
  }), [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'h-full min-h-0'
    host.appendChild(mount)

    let ready = false
    let disposed = false
    let localInstance: Instance | null = null
    const instancePromise = Promise.resolve(ink(mount, {
      doc: valueRef.current,
      files: { clipboard: false, dragAndDrop: false, injectMarkup: true },
      hooks: { afterUpdate: (nextValue) => { if (ready) onChangeRef.current(nextValue) } },
      interface: {
        appearance: 'auto', attribution: false, autocomplete: false, images: false,
        lists: true, readonly: false, spellcheck: false, toolbar: false,
      },
      plugins: [
        Prec.highest(keymap.of([{
          key: 'Mod-s',
          run: () => {
            onSaveRef.current?.()
            return true
          },
        }])),
        ViewPlugin.define((view) => {
          viewRef.current = view
          return { destroy: () => { if (viewRef.current === view) viewRef.current = null } }
        }),
        ...extensions,
      ].map((extension) => ({ type: 'default' as const, value: extension })),
      search: false,
      toolbar: { bold: false, code: false, codeBlock: false, heading: false, image: false, italic: false, link: false, list: false, orderedList: false, quote: false, taskList: false, upload: false },
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

    const scheduler = createMeasureScheduler(() => viewRef.current)
    const resizeObserver = new ResizeObserver(scheduler.request)
    resizeObserver.observe(host)
    const onTransitionEnd = (event: TransitionEvent): void => {
      const target = event.target
      if ((event.propertyName === 'width' || event.propertyName === 'height') && target instanceof Element && target.contains(host)) scheduler.request()
    }
    window.addEventListener('transitionend', onTransitionEnd)
    scheduler.request()

    return () => {
      disposed = true
      ready = false
      resizeObserver.disconnect()
      scheduler.dispose()
      window.removeEventListener('transitionend', onTransitionEnd)
      if (localInstance) localInstance.destroy()
      if (instanceRef.current === localInstance) instanceRef.current = null
      mount.remove()
    }
  // The editor owns its state after initialization; external reloads use the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const instance = instanceRef.current
    if (!instance || instance.getDoc() === value) return
    instance.update(value)
  }, [value])

  return <div ref={hostRef} className={cn('h-full min-h-0', className)} />
})
