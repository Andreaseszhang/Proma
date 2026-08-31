import { describe, expect, test } from 'bun:test'
import { MAX_AUTO_BROWSER_ZOOM_PASSES, resolveAutoBrowserZoomFactor, resolveBrowserLayoutViewportWidth, resolveBrowserPageWidth } from './browser-auto-zoom'

describe('browser auto zoom measurements', () => {
  test('prefers documentElement/innerWidth for the layout viewport and uses body only as fallback', () => {
    expect(resolveBrowserLayoutViewportWidth(800, 900, 1600)).toBe(800)
    expect(resolveBrowserLayoutViewportWidth(0, 900, 1600)).toBe(900)
    expect(resolveBrowserLayoutViewportWidth(0, 0, 1600)).toBe(1600)
  })

  test('retains a fixed-width body as intrinsic width when root scrollWidth is viewport-clamped', () => {
    expect(resolveBrowserPageWidth(2666, 1600, 2666)).toEqual({ pageWidth: 1600, intrinsicPageWidth: 1600 })
    expect(resolveBrowserPageWidth(3200, 3200, 2666)).toEqual({ pageWidth: 3200 })
  })

  test('bounds unknown-width upward probing to the supported zoom tiers', () => {
    let zoom = 0.5
    for (let pass = 0; pass < MAX_AUTO_BROWSER_ZOOM_PASSES; pass++) {
      zoom = resolveAutoBrowserZoomFactor({ pageWidth: 1400, layoutViewportWidth: 1400, viewportWidth: 700, currentZoom: zoom })
    }
    expect(zoom).toBe(1)
    expect(MAX_AUTO_BROWSER_ZOOM_PASSES).toBe(10)
  })
})

describe('resolveAutoBrowserZoomFactor', () => {
  test('keeps 100% only when the page actually fits', () => {
    expect(resolveAutoBrowserZoomFactor(800, 800)).toBe(1)
    expect(resolveAutoBrowserZoomFactor(880, 800)).toBe(0.9)
  })

  test('uses the cached intrinsic width to recover from the 50% state', () => {
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 3200, layoutViewportWidth: 3200, viewportWidth: 1400, currentZoom: 0.5, intrinsicPageWidth: 1600 })).toBe(0.85)
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 3800, layoutViewportWidth: 3800, viewportWidth: 1900, currentZoom: 0.5, intrinsicPageWidth: 1600 })).toBe(1)
  })

  test('probes only one tier upward from the 50% floor when intrinsic width is unknown', () => {
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 1400, layoutViewportWidth: 1400, viewportWidth: 700, currentZoom: 0.5 })).toBe(0.55)
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 1000, layoutViewportWidth: 1000, viewportWidth: 900, currentZoom: 0.9 })).toBe(1)
  })

  test('uses the native viewport width and current zoom consistently', () => {
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 1200, layoutViewportWidth: 1000, viewportWidth: 900, currentZoom: 0.8 })).toBe(0.75)
  })

  test('uses every supported zoom tier before the 50% floor', () => {
    expect([
      resolveAutoBrowserZoomFactor(1200, 1080),
      resolveAutoBrowserZoomFactor(1200, 1020),
      resolveAutoBrowserZoomFactor(1200, 960),
      resolveAutoBrowserZoomFactor(1200, 900),
      resolveAutoBrowserZoomFactor(1200, 840),
      resolveAutoBrowserZoomFactor(1200, 780),
      resolveAutoBrowserZoomFactor(1200, 720),
      resolveAutoBrowserZoomFactor(1200, 660),
      resolveAutoBrowserZoomFactor(1200, 600),
    ]).toEqual([0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5])
  })

  test('selects the largest supported zoom that can fit the page', () => {
    expect(resolveAutoBrowserZoomFactor(850, 700)).toBe(0.8)
    expect(resolveAutoBrowserZoomFactor(1000, 850)).toBe(0.85)
    expect(resolveAutoBrowserZoomFactor(1000, 780)).toBe(0.75)
    expect(resolveAutoBrowserZoomFactor(1200, 1000)).toBe(0.8)
  })

  test('never zooms below the 50% readability floor', () => {
    expect(resolveAutoBrowserZoomFactor(1_600, 700)).toBe(0.5)
  })

  test('safely falls back to 100% for invalid dimensions', () => {
    expect(resolveAutoBrowserZoomFactor(0, 800)).toBe(1)
    expect(resolveAutoBrowserZoomFactor(800, 0)).toBe(1)
    expect(resolveAutoBrowserZoomFactor(Number.NaN, 800)).toBe(1)
    expect(resolveAutoBrowserZoomFactor({ pageWidth: 1000, layoutViewportWidth: 1000, viewportWidth: 800, currentZoom: 0 })).toBe(1)
  })
})
