import { beforeEach, expect, test } from 'bun:test'
import {
  MAX_VAULT_SCROLL_ANCHORS,
  VAULT_SCROLL_SETTLE_MS,
  VaultScrollSession,
  clearVaultScrollAnchors,
  dumpVaultScrollAnchors,
  getVaultScrollKey,
  readVaultScrollAnchor,
  writeVaultScrollAnchor,
} from './vault-scroll-memory'
import {
  attachVaultScrollMemory,
  type VaultScrollMemoryRuntime,
  type VaultScrollMemoryView,
} from './useVaultScrollMemory'

class FakeScroller extends EventTarget {
  scrollTop = 0
}

function createMemoryView(docLength = 40): {
  view: VaultScrollMemoryView
  scroller: FakeScroller
  dispatches: unknown[]
} {
  const scroller = new FakeScroller()
  const dispatches: unknown[] = []
  const view = {
    scrollDOM: scroller as unknown as HTMLElement,
    state: { doc: { length: docLength } },
    dispatch: (spec: unknown) => { dispatches.push(spec) },
  } as unknown as VaultScrollMemoryView
  return { view, scroller, dispatches }
}

beforeEach(() => {
  clearVaultScrollAnchors()
})

test('a note opened for the first time has nothing to restore', () => {
  const session = new VaultScrollSession(undefined, 0)

  expect(session.pendingAnchor).toBeNull()
  expect(session.canRemember(VAULT_SCROLL_SETTLE_MS)).toBe(true)
})

test('a remembered anchor is offered for restore exactly once', () => {
  const session = new VaultScrollSession({ pos: 4_120, lineOffset: 12 }, 0)

  expect(session.pendingAnchor).toEqual({ pos: 4_120, lineOffset: 12 })
  session.markRestoreApplied(0)
  expect(session.pendingAnchor).toBeNull()
})

test("CodeMirror's own mount-time scrolling cannot overwrite the memory", () => {
  const session = new VaultScrollSession({ pos: 4_120, lineOffset: 0 }, 0)

  expect(session.canRemember(0)).toBe(false)
  session.markRestoreApplied(10)
  expect(session.canRemember(20)).toBe(false)
  expect(session.canRemember(10 + VAULT_SCROLL_SETTLE_MS)).toBe(true)
})

test('the remembered anchor survives a tab switch that happens during the restore', () => {
  const session = new VaultScrollSession({ pos: 4_120, lineOffset: 12 }, 0)
  expect(session.anchorForTeardown()).toEqual({ pos: 4_120, lineOffset: 12 })
})

test('an explicit reader scroll takes over immediately', () => {
  const session = new VaultScrollSession({ pos: 4_120, lineOffset: 0 }, 0)
  session.takeOver(50)

  expect(session.pendingAnchor).toBeNull()
  expect(session.canRemember(50)).toBe(true)
  expect(session.remember({ pos: 900, lineOffset: 4 })).toEqual({ pos: 900, lineOffset: 4 })
  expect(session.anchorForTeardown()).toEqual({ pos: 900, lineOffset: 4 })
})

test('reading further updates what will be persisted', () => {
  const session = new VaultScrollSession(undefined, 0)
  session.remember({ pos: 300, lineOffset: 0 })
  session.remember({ pos: 1_800, lineOffset: 6 })
  expect(session.anchorForTeardown()).toEqual({ pos: 1_800, lineOffset: 6 })
})

test('the center view and each session tab remember the same note separately in each Vault', () => {
  const vaultA = 'vault-a'
  const vaultB = 'vault-b'
  const centerKey = getVaultScrollKey(vaultA, '08-note.md')
  const sideKey = getVaultScrollKey(vaultA, '08-note.md', 'session-1')
  const otherSideKey = getVaultScrollKey(vaultA, '08-note.md', 'session-2')
  const sameNoteInOtherVaultKey = getVaultScrollKey(vaultB, '08-note.md')

  expect(new Set([centerKey, sideKey, otherSideKey, sameNoteInOtherVaultKey]).size).toBe(4)
  writeVaultScrollAnchor(centerKey, { pos: 120, lineOffset: 0 })
  writeVaultScrollAnchor(sideKey, { pos: 4_120, lineOffset: 12 })
  writeVaultScrollAnchor(sameNoteInOtherVaultKey, { pos: 900, lineOffset: 4 })

  expect(readVaultScrollAnchor(centerKey)).toEqual({ pos: 120, lineOffset: 0 })
  expect(readVaultScrollAnchor(sideKey)).toEqual({ pos: 4_120, lineOffset: 12 })
  expect(readVaultScrollAnchor(otherSideKey)).toBeUndefined()
  expect(readVaultScrollAnchor(sameNoteInOtherVaultKey)).toEqual({ pos: 900, lineOffset: 4 })
})

test('the attach layer restores through the EditorView contract and cleans every event/async resource', () => {
  const { view, scroller, dispatches } = createMemoryView()
  const key = getVaultScrollKey('vault-a', 'note.md')
  writeVaultScrollAnchor(key, { pos: 12, lineOffset: 3 })

  let now = 0
  let nextFrame = 0
  const frames = new Map<number, FrameRequestCallback>()
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  const runtime: VaultScrollMemoryRuntime = {
    now: () => now,
    requestFrame: (callback) => { const id = ++nextFrame; frames.set(id, callback); return id },
    cancelFrame: (id) => { frames.delete(id) },
    setTimer: (callback) => { const handle = setTimeout(() => undefined, 0); timers.set(handle, callback); return handle },
    clearTimer: (handle) => { timers.delete(handle); clearTimeout(handle) },
    // Layout geometry remains an Electron runtime concern; this test exercises
    // actual EventTarget, timer, RAF, dispatch and teardown wiring without
    // pretending a headless DOM can measure CodeMirror line boxes.
    readAnchorFromView: () => ({ pos: 18, lineOffset: 2 }),
  }

  const detach = attachVaultScrollMemory(view, key, runtime)
  expect(frames.size).toBe(1)
  const restore = [...frames.values()][0]
  expect(restore).toBeDefined()
  frames.clear()
  restore?.(0)
  expect(dispatches).toHaveLength(1)
  expect(frames.size).toBe(1)

  now = VAULT_SCROLL_SETTLE_MS + 1
  scroller.dispatchEvent(new Event('scroll'))
  expect(timers.size).toBe(1)
  const timer = [...timers.values()][0]
  expect(timer).toBeDefined()
  timers.clear()
  timer?.()
  expect(readVaultScrollAnchor(key)).toEqual({ pos: 18, lineOffset: 2 })

  detach()
  expect(frames.size).toBe(0)
  expect(timers.size).toBe(0)
  detach()
  scroller.dispatchEvent(new Event('scroll'))
  expect(timers.size).toBe(0)
})

test('a user-intent event bypasses the settle window in the EditorView wiring', () => {
  const { view, scroller } = createMemoryView(4)
  const key = getVaultScrollKey('vault-a', 'intent.md')
  writeVaultScrollAnchor(key, { pos: 2, lineOffset: 0 })
  let now = 0
  const timerCallbacks: Array<() => void> = []
  const runtime: VaultScrollMemoryRuntime = {
    now: () => now,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    setTimer: (callback) => { timerCallbacks.push(callback); return 1 as unknown as ReturnType<typeof setTimeout> },
    clearTimer: () => { timerCallbacks.length = 0 },
    readAnchorFromView: () => ({ pos: 1, lineOffset: 0 }),
  }

  const detach = attachVaultScrollMemory(view, key, runtime)
  scroller.dispatchEvent(new Event('wheel'))
  now = 1
  scroller.dispatchEvent(new Event('scroll'))
  const scheduledTimer = timerCallbacks[0]
  expect(scheduledTimer).toBeDefined()
  scheduledTimer?.()
  expect(readVaultScrollAnchor(key)).toEqual({ pos: 1, lineOffset: 0 })
  detach()
})

test('stored anchors and snapshots are copies, so callers cannot mutate memory', () => {
  const key = getVaultScrollKey('vault-a', 'copy.md')
  const anchor = { pos: 500, lineOffset: 2 }
  writeVaultScrollAnchor(key, anchor)
  anchor.pos = 0

  const snapshot = dumpVaultScrollAnchors()
  snapshot[key]!.pos = 1
  expect(readVaultScrollAnchor(key)).toEqual({ pos: 500, lineOffset: 2 })
})

test('the anchor store evicts the least recently used entries at its bounded capacity', () => {
  for (let index = 0; index < 205; index += 1) {
    writeVaultScrollAnchor(`key-${index}`, { pos: index, lineOffset: 0 })
  }

  expect(Object.keys(dumpVaultScrollAnchors())).toHaveLength(MAX_VAULT_SCROLL_ANCHORS)
  expect(readVaultScrollAnchor('key-0')).toBeUndefined()
  expect(readVaultScrollAnchor('key-4')).toBeUndefined()
  expect(readVaultScrollAnchor('key-5')).toEqual({ pos: 5, lineOffset: 0 })

  for (let index = 205; index < 210; index += 1) {
    writeVaultScrollAnchor(`key-${index}`, { pos: index, lineOffset: 0 })
  }
  expect(readVaultScrollAnchor('key-5')).toEqual({ pos: 5, lineOffset: 0 })
  expect(readVaultScrollAnchor('key-6')).toBeUndefined()
})
