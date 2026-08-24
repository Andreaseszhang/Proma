import * as React from 'react'
import { nextBrowserLayoutRevision } from './browser-layout-revision'
import { browserLayoutSnapshotsEqual, toBrowserLayoutSnapshot, type BrowserLayoutSnapshot } from './browser-layout-publish'
import { overlayBlocksBrowser, type BrowserOverlayRect } from './browser-overlay'
import { observeAppOverlayLifecycle } from './browser-overlay-observer'

// 每次 publish（包括卸载隐藏）分配全局单调 revision。旧 slot 的 IPC 即使晚到，
// 主进程也不会覆盖随后已挂载 tab 的可见性和边界。

/**
 * WebContentsView 是原生子视图，天然盖在 renderer DOM 之上；CSS z-index 无法反转。
 * 应用级 Dialog / Select / Popover / Dropdown 与 Sonner 通知出现时，临时隐藏原生视图，
 * 让 portal 内容获得正确的层级；浮层关闭后立即恢复浏览器。
 */
function getElementRect(element: Element): BrowserOverlayRect {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function hasBlockingAppOverlay(browserRect: BrowserOverlayRect): boolean {
  const modalOverlays = document.querySelectorAll<HTMLElement>('[data-app-modal-overlay]')
  if (Array.from(modalOverlays).some((overlay) => overlayBlocksBrowser({ kind: 'modal', rect: getElementRect(overlay) }, browserRect))) return true

  const visibleToasts = document.querySelectorAll<HTMLElement>('[data-sonner-toast][data-mounted="true"], [data-sonner-toast][data-visible="true"]')
  if (Array.from(visibleToasts).some((toast) => overlayBlocksBrowser({ kind: 'local', rect: getElementRect(toast) }, browserRect))) return true

  const localOverlays = document.querySelectorAll<HTMLElement>('[data-app-local-overlay]')
  if (Array.from(localOverlays).some((overlay) => overlayBlocksBrowser({ kind: 'local', rect: getElementRect(overlay) }, browserRect))) return true

  return Array.from(document.querySelectorAll<HTMLElement>('[data-radix-popper-content-wrapper]'))
    .some((wrapper) => {
      const contents = wrapper.querySelectorAll<HTMLElement>('[data-state="open"], [data-state="closed"]')
      // Browser Tooltip does not block interaction; other connected local overlays
      // keep the native view hidden through their close animation until unmount.
      return Array.from(contents).some((content) => content.getAttribute('role') !== 'tooltip'
        && overlayBlocksBrowser({ kind: 'local', rect: getElementRect(content) }, browserRect))
    })
}

export function BrowserSlot({ sessionId, tabId }: { sessionId: string; tabId: string }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const element = ref.current
    const setLayout = (window.electronAPI as Partial<typeof window.electronAPI>).setAgentBrowserLayout
    if (!element || typeof setLayout !== 'function') return
    let frame: number | null = null
    let lastPublished: BrowserLayoutSnapshot | null = null
    let lastPreserveSessionOnHide: boolean | null = null
    const requestLayout = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        const rect = element.getBoundingClientRect()
        const browserRect: BrowserOverlayRect = {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        }
        const overlayOpen = hasBlockingAppOverlay(browserRect)
        const snapshot = toBrowserLayoutSnapshot(rect, overlayOpen)
        const preserveSessionOnHide = overlayOpen
        if (browserLayoutSnapshotsEqual(lastPublished, snapshot)
          && lastPreserveSessionOnHide === preserveSessionOnHide) return
        lastPublished = snapshot
        lastPreserveSessionOnHide = preserveSessionOnHide
        void setLayout({
          sessionId,
          tabId,
          revision: nextBrowserLayoutRevision(),
          visible: snapshot.visible,
          preserveSessionOnHide,
          bounds: snapshot.bounds,
        })
      })
    }
    const observer = new ResizeObserver(requestLayout)
    const disconnectOverlayObserver = observeAppOverlayLifecycle(requestLayout)
    observer.observe(element)
    window.addEventListener('resize', requestLayout)
    requestLayout()
    return () => {
      observer.disconnect()
      disconnectOverlayObserver()
      window.removeEventListener('resize', requestLayout)
      if (frame !== null) cancelAnimationFrame(frame)
      void setLayout({ sessionId, tabId, revision: nextBrowserLayoutRevision(), visible: false, preserveSessionOnHide: false, bounds: { x: 0, y: 0, width: 0, height: 0 } })
    }
  }, [sessionId, tabId])

  return <div ref={ref} className="flex-1 min-h-0 bg-muted/15 titlebar-no-drag" aria-label="受管浏览器页面" />
}
