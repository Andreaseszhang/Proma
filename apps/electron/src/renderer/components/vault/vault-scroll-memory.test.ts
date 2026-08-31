import { beforeEach, expect, test } from 'bun:test'
import {
  VAULT_SCROLL_SETTLE_MS,
  VaultScrollSession,
  clearVaultScrollAnchors,
  getVaultScrollKey,
  readVaultScrollAnchor,
  writeVaultScrollAnchor,
} from './vault-scroll-memory'

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

  // While the restore is still pending, and during the settle window after it,
  // scroll events are the editor's own and must be ignored.
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

test('the center view and each session tab remember the same note separately', () => {
  const centerKey = getVaultScrollKey('08-note.md')
  const sideKey = getVaultScrollKey('08-note.md', 'session-1')
  const otherSideKey = getVaultScrollKey('08-note.md', 'session-2')

  expect(new Set([centerKey, sideKey, otherSideKey]).size).toBe(3)

  writeVaultScrollAnchor(centerKey, { pos: 120, lineOffset: 0 })
  writeVaultScrollAnchor(sideKey, { pos: 4_120, lineOffset: 12 })

  expect(readVaultScrollAnchor(centerKey)).toEqual({ pos: 120, lineOffset: 0 })
  expect(readVaultScrollAnchor(sideKey)).toEqual({ pos: 4_120, lineOffset: 12 })
  expect(readVaultScrollAnchor(otherSideKey)).toBeUndefined()
})

test('stored anchors are copies, so callers cannot mutate the memory', () => {
  const key = getVaultScrollKey('08-note.md')
  const anchor = { pos: 500, lineOffset: 2 }
  writeVaultScrollAnchor(key, anchor)
  anchor.pos = 0

  expect(readVaultScrollAnchor(key)).toEqual({ pos: 500, lineOffset: 2 })
})
