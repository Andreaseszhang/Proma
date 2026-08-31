import * as React from 'react'
import { EditorView } from '@codemirror/view'
import {
  VaultScrollSession,
  dumpVaultScrollAnchors,
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

/**
 * Restores the reading position of the open note and keeps following the reader.
 *
 * The anchor is applied through CodeMirror's own scrollIntoView effect, so it
 * does not depend on the scroll height having been measured yet.
 */
export function useVaultScrollMemory({ getView, storageKey }: UseVaultScrollMemoryOptions): () => void {
  const [readyToken, setReadyToken] = React.useState(0)

  React.useEffect(() => {
    let disposed = false
    let view: EditorView | null = null
    let session: VaultScrollSession | null = null
    let scroller: HTMLElement | null = null
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    let attachFrame = 0
    let restoreFrame = 0
    let attempts = 0

    const persistNow = (): void => {
      persistTimer = null
      if (!view || !session || disposed) return
      if (!session.canRemember(performance.now())) return
      const anchor = readVaultScrollAnchorFromView(view)
      if (!anchor) return
      writeVaultScrollAnchor(storageKey, session.remember(anchor))
    }

    const handleScroll = (): void => {
      if (persistTimer !== null) return
      persistTimer = setTimeout(persistNow, 150)
    }

    const handleUserIntent = (): void => {
      if (!session) return
      session.takeOver(performance.now())
    }

    const applyRestore = (): void => {
      restoreFrame = 0
      if (disposed || !view || !session) return
      const anchor = session.pendingAnchor
      if (!anchor) return

      // CodeMirror places the anchor line at the top of the viewport itself, so
      // this works before the full document height is known.
      view.dispatch({ effects: EditorView.scrollIntoView(Math.min(anchor.pos, view.state.doc.length), { y: 'start', yMargin: 0 }) })
      session.markRestoreApplied(performance.now())

      if (anchor.lineOffset > 0) {
        requestAnimationFrame(() => {
          if (disposed || !view) return
          view.scrollDOM.scrollTop += anchor.lineOffset
        })
      }
    }

    const attach = (): void => {
      attachFrame = 0
      if (disposed) return
      const nextView = getView()
      if (!nextView) {
        // ink-mde mounts asynchronously; keep polling briefly instead of giving up.
        if (attempts++ > 120) return
        attachFrame = requestAnimationFrame(attach)
        return
      }

      view = nextView
      scroller = nextView.scrollDOM
      session = new VaultScrollSession(readVaultScrollAnchor(storageKey), performance.now())
      if (import.meta.env.DEV) {
        // Lets a running dev build be inspected while verifying this behaviour.
        Object.assign(window as unknown as Record<string, unknown>, {
          __vaultScroll: {
            dump: dumpVaultScrollAnchors,
            activeKey: storageKey,
            getScroller: () => scroller,
          },
        })
      }
      scroller.addEventListener('scroll', handleScroll, { passive: true })
      scroller.addEventListener('wheel', handleUserIntent, { passive: true })
      scroller.addEventListener('pointerdown', handleUserIntent, { passive: true })
      scroller.addEventListener('keydown', handleUserIntent)
      restoreFrame = requestAnimationFrame(applyRestore)
    }

    attach()

    return () => {
      disposed = true
      if (attachFrame) cancelAnimationFrame(attachFrame)
      if (restoreFrame) cancelAnimationFrame(restoreFrame)
      if (persistTimer !== null) clearTimeout(persistTimer)

      // Persist the latest reader position before the tab switch destroys the editor.
      if (view && session) {
        const live = session.canRemember(performance.now()) ? readVaultScrollAnchorFromView(view) : null
        const anchor = live ?? session.anchorForTeardown()
        if (anchor) writeVaultScrollAnchor(storageKey, anchor)
      }

      scroller?.removeEventListener('scroll', handleScroll)
      scroller?.removeEventListener('wheel', handleUserIntent)
      scroller?.removeEventListener('pointerdown', handleUserIntent)
      scroller?.removeEventListener('keydown', handleUserIntent)
      view = null
      session = null
      scroller = null
    }
  }, [getView, storageKey, readyToken])

  return React.useCallback(() => {
    setReadyToken((token) => token + 1)
  }, [])
}
