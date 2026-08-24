export interface BrowserLayoutBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserLayoutSnapshot {
  visible: boolean
  bounds: BrowserLayoutBounds
}

export interface BrowserLayoutRect {
  x: number
  y: number
  width: number
  height: number
}

/** Convert a DOM measurement into the exact layout payload sent over IPC. */
export function toBrowserLayoutSnapshot(
  rect: BrowserLayoutRect,
  overlayBlocksBrowser: boolean,
): BrowserLayoutSnapshot {
  const bounds = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
  return {
    visible: !overlayBlocksBrowser && bounds.width > 4 && bounds.height > 4,
    bounds,
  }
}

/** Layout revisions are only needed when the normalized IPC payload changes. */
export function browserLayoutSnapshotsEqual(
  first: BrowserLayoutSnapshot | null,
  second: BrowserLayoutSnapshot,
): boolean {
  return !!first
    && first.visible === second.visible
    && first.bounds.x === second.bounds.x
    && first.bounds.y === second.bounds.y
    && first.bounds.width === second.bounds.width
    && first.bounds.height === second.bounds.height
}
