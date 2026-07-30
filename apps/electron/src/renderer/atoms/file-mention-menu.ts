import { atomWithStorage } from 'jotai/utils'

export const FILE_MENTION_MENU_DEFAULT_WIDTH = 336

const FILE_MENTION_MENU_MAX_WIDTH = 800
const FILE_MENTION_MENU_VIEWPORT_GUTTER = 16

/** 将菜单宽度约束在可操作范围内，同时为窄窗口保留两侧安全边距。 */
export function clampFileMentionMenuWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(
    240,
    Math.min(FILE_MENTION_MENU_MAX_WIDTH, viewportWidth - FILE_MENTION_MENU_VIEWPORT_GUTTER),
  )
  const minWidth = Math.min(FILE_MENTION_MENU_DEFAULT_WIDTH, maxWidth)
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)))
}

/** @ 和 Slash "引用文件" 菜单共用的持久化宽度。 */
export const fileMentionMenuWidthAtom = atomWithStorage<number>(
  'proma-file-mention-menu-width',
  FILE_MENTION_MENU_DEFAULT_WIDTH,
  undefined,
  { getOnInit: true },
)
