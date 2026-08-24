import { describe, expect, test } from 'bun:test'
import {
  browserLayoutSnapshotsEqual,
  toBrowserLayoutSnapshot,
  type BrowserLayoutSnapshot,
} from './browser-layout-publish'

const visible: BrowserLayoutSnapshot = {
  visible: true,
  bounds: { x: 600, y: 100, width: 500, height: 700 },
}

describe('受管浏览器布局发布快照', () => {
  test('首次布局必须发布', () => {
    expect(browserLayoutSnapshotsEqual(null, visible)).toBe(false)
  })

  test('亚像素变动归一化后不重复发布', () => {
    const next = toBrowserLayoutSnapshot(
      { x: 600.2, y: 100.4, width: 500.3, height: 699.8 },
      false,
    )
    expect(browserLayoutSnapshotsEqual(visible, next)).toBe(true)
  })

  test('整数边界或可见性变化必须发布', () => {
    expect(browserLayoutSnapshotsEqual(visible, {
      visible: true,
      bounds: { ...visible.bounds, x: 601 },
    })).toBe(false)
    expect(browserLayoutSnapshotsEqual(visible, {
      ...visible,
      visible: false,
    })).toBe(false)
  })

  test('过小浏览器槽归一化为隐藏状态', () => {
    expect(toBrowserLayoutSnapshot({ x: 0, y: 0, width: 4.4, height: 20 }, false).visible).toBe(false)
    expect(toBrowserLayoutSnapshot({ x: 0, y: 0, width: 20, height: 20 }, true).visible).toBe(false)
  })
})
