import { describe, expect, test } from 'bun:test'
import {
  clearStopGenerationTarget,
  getLastInteractedStopTarget,
  getStopGenerationTarget,
  rememberStopGenerationTarget,
  resolveStopGenerationTarget,
} from './stop-generation-target'

describe('resolveStopGenerationTarget', () => {
  test('targets the visible delegated child instead of its parent', () => {
    expect(resolveStopGenerationTarget(
      { type: 'agent', sessionId: 'parent-session' },
      'delegation:child-session',
    )).toEqual({ kind: 'agent', sessionId: 'child-session' })
  })

  test('targets the active parent when no delegated child is visible', () => {
    expect(resolveStopGenerationTarget(
      { type: 'agent', sessionId: 'parent-session' },
      'files',
    )).toEqual({ kind: 'agent', sessionId: 'parent-session' })
  })

  test('targets the visible chat conversation', () => {
    expect(resolveStopGenerationTarget(
      { type: 'chat', sessionId: 'chat-session' },
      undefined,
    )).toEqual({ kind: 'chat', sessionId: 'chat-session' })
  })

  test('does not target non-conversation tabs', () => {
    expect(resolveStopGenerationTarget(
      { type: 'scratch', sessionId: '__scratch-pad__' },
      undefined,
    )).toBeNull()
  })
})

describe('last interacted stop target', () => {
  test('uses the session with the latest focus or click, rather than its visible sibling', () => {
    const parent = { kind: 'agent' as const, sessionId: 'parent-session' }
    const child = { kind: 'agent' as const, sessionId: 'child-session' }

    rememberStopGenerationTarget(parent)
    expect(getLastInteractedStopTarget()).toEqual(parent)

    rememberStopGenerationTarget(child)
    clearStopGenerationTarget(parent)
    expect(getLastInteractedStopTarget()).toEqual(child)

    clearStopGenerationTarget(child)
    expect(getLastInteractedStopTarget()).toBeNull()
  })
})

describe('getStopGenerationTarget', () => {
  test('accepts a valid targeted event', () => {
    const event = new CustomEvent('proma:stop-generation', {
      detail: { kind: 'agent', sessionId: 'child-session' },
    })

    expect(getStopGenerationTarget(event)).toEqual({ kind: 'agent', sessionId: 'child-session' })
  })

  test('rejects malformed event detail', () => {
    expect(getStopGenerationTarget(new Event('proma:stop-generation'))).toBeNull()
    expect(getStopGenerationTarget(new CustomEvent('proma:stop-generation', {
      detail: { kind: 'agent', sessionId: '' },
    }))).toBeNull()
  })
})
