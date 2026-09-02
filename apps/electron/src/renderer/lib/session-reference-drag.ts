/**
 * 左侧 Agent 会话行拖入输入框时使用的内部拖放协议。
 * 自定义 MIME 用于可靠识别来源，text/plain 仅作为宿主兼容兜底。
 */

export const SESSION_REFERENCE_DRAG_MIME = 'application/x-proma-session-reference'

export interface SessionReferenceDragItem {
  sessionId: string
  title: string
}

let activeSessionReferenceDragId: string | null = null

export function setSessionReferenceDragData(
  dataTransfer: DataTransfer,
  item: SessionReferenceDragItem,
): void {
  activeSessionReferenceDragId = item.sessionId
  try {
    dataTransfer.setData(SESSION_REFERENCE_DRAG_MIME, JSON.stringify(item))
    dataTransfer.setData(
      'text/plain',
      `&session:${item.sessionId}::${encodeURIComponent(item.title)}`,
    )
    dataTransfer.effectAllowed = 'copy'
  } catch (error) {
    activeSessionReferenceDragId = null
    throw error
  }
}

export function isSessionReferenceDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(SESSION_REFERENCE_DRAG_MIME)
}

/** dragover 无法读取 payload，只能结合可枚举的 MIME type 使用 dragstart 内存态。 */
export function getActiveSessionReferenceDragId(dataTransfer: DataTransfer): string | null {
  return isSessionReferenceDrag(dataTransfer) ? activeSessionReferenceDragId : null
}

export function clearSessionReferenceDragState(): void {
  activeSessionReferenceDragId = null
}

export function canReferenceDraggedSession(
  item: SessionReferenceDragItem,
  currentSessionId: string,
): boolean {
  return item.sessionId !== currentSessionId
}

export function getSessionReferenceDragData(
  dataTransfer: DataTransfer,
): SessionReferenceDragItem | null {
  const raw = dataTransfer.getData(SESSION_REFERENCE_DRAG_MIME)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isSessionReferenceDragItem(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isSessionReferenceDragItem(item: unknown): item is SessionReferenceDragItem {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Partial<SessionReferenceDragItem>
  return (
    typeof candidate.sessionId === 'string'
    && candidate.sessionId.trim().length > 0
    && typeof candidate.title === 'string'
    && candidate.title.trim().length > 0
  )
}
