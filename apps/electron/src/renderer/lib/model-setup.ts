import type { Channel } from '@proma/shared'

/**
 * 首次进入 Proma 前只要求用户至少保存过一个渠道。
 * 已有用户即使暂时停用渠道，也不应因为升级被重新拦截。
 */
export function requiresInitialModelSetup(channels: readonly Channel[]): boolean {
  return channels.length === 0
}
