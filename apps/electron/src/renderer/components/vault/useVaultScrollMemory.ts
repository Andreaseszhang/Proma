import * as React from 'react'
import { EditorView } from '@codemirror/view'
import {
  VaultScrollSession,
  readVaultScrollAnchor,
  writeVaultScrollAnchor,
  type VaultScrollAnchor,
} from './vault-scroll-memory'

/** Reads the document anchor that is currently at the top of the viewport. */
export function readVaultScrollAnchorFromView(view: EditorView): VaultScrollAnchor | null {
  const scroller = view.scrollDOM
  const rect = scroller.getBoundingClientRect()
  if (rect.height === 0) return null
  if (scroller.scrollTop <= 0) return { pos: 0, lineOffset: 0 }

  const pos = view.posAtCoords({ x: rect.left + 4, y: rect.top + 1 }, false)
  if (pos == null) return null
  const line = view.lineBlockAt(pos)
  const coords = view.coordsAtPos(line.from)
  const lineOffset = coords ? Math.max(0, Math.round(rect.top - coords.top)) : 0
  return { pos: line.from, lineOffset }
}

interface UseVaultScrollMemoryOptions {
  /** Returns the live CodeMirror view; null until the editor has mounted. */
  getView: () => EditorView | null
  storageKey: string
}

export interface VaultScrollMemoryView {
  readonly scrollDOM: HTMLElement
  readonly state: EditorView['state']
  dispatch: EditorView['dispatch']
}

export interface VaultScrollMemoryRuntime {
  now: () => number
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (handle: number) => void
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void
  readAnchorFromView: (view: VaultScrollMemoryView) => VaultScrollAnchor | null
}

const browserRuntime: VaultScrollMemoryRuntime = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (handle) => clearTimeout(handle),
  readAnchorFromView: (view) => readVaultScrollAnchorFromView(view as EditorView),
}

/**
 * Wires one live EditorView to scroll memory. Kept outside React so tests can
 * exercise the actual event/timer/dispatch contract without pretending jsdom
 * has CodeMirror layout measurements.
 */
export function attachVaultScrollMemory(
  view: VaultScrollMemoryView,
  storageKey: string,
  runtime: VaultScrollMemoryRuntime = browserRuntime,
): () => void {
  let disposed = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let restoreFrame = 0
  let offsetFrame = 0
  const scroller = view.scrollDOM
  const session = new VaultScrollSession(readVaultScrollAnchor(storageKey), runtime.now())

  const persistNow = (): void => {
    persistTimer = null
    if (disposed || !session.canRemember(runtime.now())) return
    const anchor = runtime.readAnchorFromView(view)
    if (!anchor) return
    writeVaultScrollAnchor(storageKey, session.remember(anchor))
  }

  const handleScroll = (): void => {
    if (persistTimer !== null) return
    persistTimer = runtime.setTimer(persistNow, 150)
  }

  const handleUserIntent = (): void => {
    session.takeOver(runtime.now())
  }

  const applyRestore = (): void => {
    restoreFrame = 0
    if (disposed) return
    const anchor = session.pendingAnchor
    if (!anchor) return

    // CodeMirror places the anchor line at the top of the viewport itself, so
    // this works before the full document height is known.
    view.dispatch({
      effects: EditorView.scrollIntoView(
        Math.min(anchor.pos, view.state.doc.length),
        { y: 'start', yMargin: 0 },
      ),
    })
    session.markRestoreApplied(runtime.now())

    if (anchor.lineOffset > 0) {
      offsetFrame = runtime.requestFrame(() => {
        offsetFrame = 0
        if (!disposed) scroller.scrollTop += anchor.lineOffset
      })
    }
  }

  scroller.addEventListener('scroll', handleScroll, { passive: true })
  scroller.addEventListener('wheel', handleUserIntent, { passive: true })
  scroller.addEventListener('pointerdown', handleUserIntent, { passive: true })
  scroller.addEventListener('keydown', handleUserIntent)
  restoreFrame = runtime.requestFrame(applyRestore)

  return () => {
    if (disposed) return
    disposed = true
    scroller.removeEventListener('scroll', handleScroll)
    scroller.removeEventListener('wheel', handleUserIntent)
    scroller.removeEventListener('pointerdown', handleUserIntent)
    scroller.removeEventListener('keydown', handleUserIntent)
    if (restoreFrame) runtime.cancelFrame(restoreFrame)
    if (offsetFrame) runtime.cancelFrame(offsetFrame)
    if (persistTimer !== null) runtime.clearTimer(persistTimer)

    // Persist the latest reader position before a tab switch destroys the view.
    const live = session.canRemember(runtime.now()) ? runtime.readAnchorFromView(view) : null
    const anchor = live ?? session.anchorForTeardown()
    if (anchor) writeVaultScrollAnchor(storageKey, anchor)
  }
}

/**
 * Restores the reading position after ink-mde reports that its CodeMirror view
 * is ready, then follows explicit reader scrolling until unmount.
 */
export function useVaultScrollMemory({ getView, storageKey }: UseVaultScrollMemoryOptions): () => void {
  const [readyToken, setReadyToken] = React.useState(0)

  React.useEffect(() => {
    // Waiting for onReady avoids racing the ink-mde promise and attaching twice:
    // LiveMarkdownEditor sets its EditorView ref before it invokes onReady.
    if (readyToken === 0) return
    const view = getView()
    if (!view) return
    return attachVaultScrollMemory(view, storageKey)
  }, [getView, storageKey, readyToken])

  return React.useCallback(() => {
    setReadyToken((token) => token + 1)
  }, [])
}
