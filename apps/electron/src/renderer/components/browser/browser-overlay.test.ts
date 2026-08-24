import { describe, expect, test } from 'bun:test'
import {
  overlayBlocksBrowser,
  rectanglesOverlap,
  type BrowserOverlay,
  type BrowserOverlayRect,
} from './browser-overlay'

const browser: BrowserOverlayRect = { left: 600, top: 100, right: 1200, bottom: 800 }

const overlay = (kind: BrowserOverlay['kind'], rect: BrowserOverlayRect): BrowserOverlay => ({ kind, rect })

describe('受管浏览器与应用浮层的矩形遮挡判定', () => {
  test('左侧输入区的浮层不隐藏浏览器页面', () => {
    expect(rectanglesOverlap({ left: 80, top: 600, right: 500, bottom: 760 }, browser)).toBe(false)
  })

  test('覆盖浏览器区域的浮层会隐藏原生页面以显示浮层', () => {
    expect(rectanglesOverlap({ left: 560, top: 420, right: 760, bottom: 620 }, browser)).toBe(true)
  })

  test('仅边缘相切不算遮挡', () => {
    expect(rectanglesOverlap({ left: 0, top: 100, right: 600, bottom: 800 }, browser)).toBe(false)
  })
})

describe('应用浮层策略', () => {
  const outsideBrowser = { left: 80, top: 600, right: 500, bottom: 760 }

  test('Dialog 即使内容框在浏览器外也会阻塞原生页面', () => {
    expect(overlayBlocksBrowser(overlay('modal', outsideBrowser), browser)).toBe(true)
  })

  test('AlertDialog 即使内容框在浏览器外也会阻塞原生页面', () => {
    expect(overlayBlocksBrowser(overlay('modal', outsideBrowser), browser)).toBe(true)
  })

  test('局部覆盖物只有实际相交时才阻塞原生页面', () => {
    expect(overlayBlocksBrowser(overlay('local', { left: 560, top: 420, right: 760, bottom: 620 }), browser)).toBe(true)
    expect(overlayBlocksBrowser(overlay('local', outsideBrowser), browser)).toBe(false)
  })

  test('局部覆盖物与浏览器边缘相切时不阻塞原生页面', () => {
    expect(overlayBlocksBrowser(overlay('local', { left: 0, top: 100, right: 600, bottom: 800 }), browser)).toBe(false)
  })
})
