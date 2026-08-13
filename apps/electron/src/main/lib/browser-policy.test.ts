import { describe, expect, test } from 'bun:test'
import { assertSafeBrowserUrl, isSupportedBrowserPopupUrl, isTransientBrowserPopupUrl, normalizeBrowserUrl } from './browser-policy'

describe('managed browser popup URL policy', () => {
  test('Given transient popup URLs When checking support Then permits them only as popup entry URLs', () => {
    expect(isSupportedBrowserPopupUrl('about:blank')).toBe(true)
    expect(isSupportedBrowserPopupUrl('blob:https://example.com/export')).toBe(true)
    expect(isSupportedBrowserPopupUrl('data:text/plain,export')).toBe(true)
    expect(isTransientBrowserPopupUrl('about:blank')).toBe(true)
    expect(isTransientBrowserPopupUrl('blob:https://example.com/export')).toBe(true)
    expect(isTransientBrowserPopupUrl('https://example.com')).toBe(false)
  })

  test('Given unsafe popup protocols When checking support Then rejects them', () => {
    expect(isSupportedBrowserPopupUrl('file:///tmp/export.txt')).toBe(false)
    expect(isSupportedBrowserPopupUrl('javascript:alert(1)')).toBe(false)
    expect(isSupportedBrowserPopupUrl('//example.com/export')).toBe(false)
    expect(isSupportedBrowserPopupUrl('')).toBe(false)
  })

  test('Given a public HTTP(S) destination When normalizing Then keeps the supported browser URL', () => {
    expect(normalizeBrowserUrl('example.com/report')).toBe('https://example.com/report')
    expect(assertSafeBrowserUrl('https://example.com/report')).toBe('https://example.com/report')
    expect(isSupportedBrowserPopupUrl('https://example.com/report')).toBe(true)
  })
})
