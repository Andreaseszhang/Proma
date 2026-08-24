export interface BrowserOverlayRect {
  left: number
  top: number
  right: number
  bottom: number
}

export type BrowserOverlayKind = 'modal' | 'local'

export interface BrowserOverlay {
  kind: BrowserOverlayKind
  rect: BrowserOverlayRect
}

/** 判断两个屏幕矩形是否有实际面积的交集。边缘相切不算遮挡。 */
export function rectanglesOverlap(first: BrowserOverlayRect, second: BrowserOverlayRect): boolean {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
}

/**
 * 判断应用浮层是否需要隐藏原生浏览器视图。
 * 模态 Dialog 的 fixed 遮罩覆盖整个 renderer，即使内容矩形在浏览器外也必须阻塞。
 */
export function overlayBlocksBrowser(overlay: BrowserOverlay, browserRect: BrowserOverlayRect): boolean {
  return overlay.kind === 'modal' || rectanglesOverlap(overlay.rect, browserRect)
}
