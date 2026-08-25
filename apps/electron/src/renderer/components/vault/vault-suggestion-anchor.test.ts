import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { EditorView } from '@codemirror/view'
import { clampSuggestionPosition, getEditorCaretAnchor, isVaultTriggerContext, nextSuggestionIndex, shouldCloseVaultSuggestion } from './VaultLiveMarkdownEditor'

interface FakeWindow {
  innerWidth: number
  innerHeight: number
  getSelection: () => { rangeCount: number; anchorNode: unknown; getRangeAt: () => unknown } | null
}

const originalWindow = (globalThis as { window?: unknown }).window

function installWindow(overrides: Partial<FakeWindow> = {}): void {
  ;(globalThis as { window?: unknown }).window = {
    innerWidth: 1440,
    innerHeight: 900,
    getSelection: () => null,
    ...overrides,
  }
}

function createHost(options: {
  hostRect?: Partial<DOMRect>
  cursorRect?: Partial<DOMRect> | null
} = {}): HTMLElement {
  const hostRect = { left: 300, top: 120, width: 800, height: 600, bottom: 720, right: 1100, x: 300, y: 120 }
  return {
    getBoundingClientRect: () => ({ ...hostRect, ...options.hostRect, toJSON: () => ({}) }) as DOMRect,
    querySelector: () => (options.cursorRect
      ? { getBoundingClientRect: () => ({ ...options.cursorRect, toJSON: () => ({}) }) as DOMRect }
      : null),
    contains: () => false,
  } as unknown as HTMLElement
}

function createView(coords: { left: number; bottom: number } | null): EditorView {
  return {
    state: { selection: { main: { head: 42 } } },
    coordsAtPos: () => (coords ? { left: coords.left, right: coords.left + 1, top: coords.bottom - 18, bottom: coords.bottom } : null),
  } as unknown as EditorView
}

describe('Vault reference suggestion anchoring', () => {
  beforeEach(() => { installWindow() })
  afterEach(() => { (globalThis as { window?: unknown }).window = originalWindow })

  test('Given a live editor When a trigger fires Then CodeMirror caret coordinates anchor the popup', () => {
    const anchor = getEditorCaretAnchor(createView({ left: 612, bottom: 348 }), createHost())
    expect(anchor).toEqual({ left: 612, bottom: 348 })
    expect(clampSuggestionPosition(anchor)).toEqual({ left: 612, top: 354 })
  })

  test('Given no CodeMirror geometry When a cursor element exists Then its rect anchors the popup', () => {
    const anchor = getEditorCaretAnchor(createView(null), createHost({ cursorRect: { left: 480, top: 260, width: 0, height: 18, bottom: 278 } }))
    expect(anchor).toEqual({ left: 480, bottom: 278 })
  })

  test('Given unmeasurable caret geometry When the popup opens Then it stays inside the editor instead of the viewport origin', () => {
    const anchor = getEditorCaretAnchor(createView(null), createHost({ cursorRect: { left: 0, top: 0, width: 0, height: 0, bottom: 0 } }))
    expect(anchor).toEqual({ left: 316, bottom: 160 })

    const position = clampSuggestionPosition(anchor)
    expect(position.left).toBeGreaterThan(8)
    expect(position.top).toBeGreaterThan(8)
  })

  test('Given a caret near the viewport edge When the popup opens Then it is clamped on screen', () => {
    const position = clampSuggestionPosition({ left: 1430, bottom: 895 })
    expect(position).toEqual({ left: 1124, top: 600 })
  })
})

describe('Vault reference trigger typing', () => {
  test('Given a trigger symbol inside a word When it is typed Then no suggestion opens', () => {
    expect(isVaultTriggerContext('')).toBe(true)
    expect(isVaultTriggerContext(' ')).toBe(true)
    expect(isVaultTriggerContext('\n')).toBe(true)
    expect(isVaultTriggerContext('a')).toBe(false)
    expect(isVaultTriggerContext('约')).toBe(false)
  })

  test('Given ordinary Markdown input When the trigger stays in the document Then the popup dismisses itself', () => {
    expect(shouldCloseVaultSuggestion('')).toBe(false)
    expect(shouldCloseVaultSuggestion('daily')).toBe(false)
    expect(shouldCloseVaultSuggestion('vault design')).toBe(false)

    expect(shouldCloseVaultSuggestion(' heading')).toBe(true)
    expect(shouldCloseVaultSuggestion('*')).toBe(true)
    expect(shouldCloseVaultSuggestion('and/or')).toBe(true)
    expect(shouldCloseVaultSuggestion('line\nbreak')).toBe(true)
  })

  test('Given an open suggestion list When arrow keys navigate Then the highlighted item wraps around', () => {
    expect(nextSuggestionIndex(0, 3, 1)).toBe(1)
    expect(nextSuggestionIndex(2, 3, 1)).toBe(0)
    expect(nextSuggestionIndex(0, 3, -1)).toBe(2)
    expect(nextSuggestionIndex(1, 3, -1)).toBe(0)
    expect(nextSuggestionIndex(0, 0, 1)).toBe(0)
  })
})
