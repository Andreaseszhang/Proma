import { describe, expect, test } from 'bun:test'
import { canBrowserSessionTakeForeground, isNewBrowserTabLayoutRevision } from './browser-presentation-policy'

describe('Browser 双 Pane presentation policy', () => {
  test('每个 tab 独立拒绝自己的旧布局', () => {
    expect(isNewBrowserTabLayoutRevision(12, 11)).toBe(true)
    expect(isNewBrowserTabLayoutRevision(11, 11)).toBe(false)
    expect(isNewBrowserTabLayoutRevision(10, 11)).toBe(false)
  })

  test('同一前台 Session 的第二个 Pane 不受另一 Pane 的全局 revision 阻挡', () => {
    expect(canBrowserSessionTakeForeground({
      incomingSessionId: 'session-a',
      foregroundSessionId: 'session-a',
      revision: 8,
      latestForegroundRevision: 12,
    })).toBe(true)
  })

  test('后台 Session 的旧 show 不能覆盖当前前台 Session', () => {
    expect(canBrowserSessionTakeForeground({
      incomingSessionId: 'session-a',
      foregroundSessionId: 'session-b',
      revision: 8,
      latestForegroundRevision: 12,
    })).toBe(false)
  })

  test('更新的 show 可以把另一个 Session 切到前台', () => {
    expect(canBrowserSessionTakeForeground({
      incomingSessionId: 'session-a',
      foregroundSessionId: 'session-b',
      revision: 13,
      latestForegroundRevision: 12,
    })).toBe(true)
  })
})
