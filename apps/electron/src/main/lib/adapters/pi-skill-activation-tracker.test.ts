import { describe, expect, test } from 'bun:test'
import { PendingPromptSkillActivationTracker } from './pi-skill-activation-tracker'
import type { SkillActivation } from '@proma/shared'

const activation: SkillActivation = {
  slug: 'deep-research',
  name: 'Deep Research',
  sources: ['explicit'],
}

describe('PendingPromptSkillActivationTracker', () => {
  test('waits for the matching Pi user message before exposing metadata', () => {
    const tracker = new PendingPromptSkillActivationTracker()
    tracker.register('<skill>one</skill>', 'user-one', [activation])

    expect(tracker.consume('<skill>two</skill>')).toBeUndefined()
    expect(tracker.consume('<skill>one</skill>')).toMatchObject({
      userMessageUuid: 'user-one',
      activations: [activation],
    })
  })

  test('keeps duplicate prompt text in FIFO order', () => {
    const tracker = new PendingPromptSkillActivationTracker()
    tracker.register('same prompt', 'user-one', [activation])
    tracker.register('same prompt', 'user-two', [activation])

    expect(tracker.consume('same prompt')?.userMessageUuid).toBe('user-one')
    expect(tracker.consume('same prompt')?.userMessageUuid).toBe('user-two')
  })

  test('discards an interrupt that never reaches Pi', () => {
    const tracker = new PendingPromptSkillActivationTracker()
    const id = tracker.register('interrupted', 'user-interrupted', [activation])
    tracker.discard(id)

    expect(tracker.consume('interrupted')).toBeUndefined()
  })
})
