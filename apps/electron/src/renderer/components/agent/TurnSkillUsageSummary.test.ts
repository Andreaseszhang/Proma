import { describe, expect, test } from 'bun:test'
import type { SDKMessage } from '@proma/shared'
import { getTurnSkillActivations } from './TurnSkillUsageSummary'

const successfulSkillRead: SDKMessage[] = [
  {
    type: 'assistant',
    message: {
      content: [{
        type: 'tool_use',
        id: 'read-skill',
        name: 'Read',
        input: { file_path: '/workspace/skills/deep-research/SKILL.md' },
      }],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'read-skill', content: 'loaded' }],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
]

describe('TurnSkillUsageSummary', () => {
  test('uses terminal metadata and historical successful Read records in one deduplicated footer list', () => {
    const activations = getTurnSkillActivations([
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 },
        skill_activations: [{
          slug: 'deep-research',
          name: 'Deep Research',
          filePath: '/workspace/skills/deep-research/SKILL.md',
          sources: ['explicit'],
        }],
      } as unknown as SDKMessage,
      ...successfulSkillRead,
    ])

    expect(activations).toEqual([{
      slug: 'deep-research',
      name: 'Deep Research',
      filePath: '/workspace/skills/deep-research/SKILL.md',
      sources: ['explicit', 'read'],
    }])
  })

  test('keeps a queued turn scoped to its source input instead of a shared terminal result', () => {
    const activations = getTurnSkillActivations([
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 },
        skill_activations: [{ slug: 'other-turn', name: 'Other Turn', sources: ['explicit'] }],
      } as unknown as SDKMessage,
    ], {
      type: 'user',
      uuid: 'queued-user',
      parent_tool_use_id: null,
      skill_activations: [{ slug: 'this-turn', name: 'This Turn', sources: ['explicit'] }],
    })

    expect(activations).toEqual([{
      slug: 'this-turn',
      name: 'This Turn',
      sources: ['explicit'],
    }])
  })

  test('uses terminal metadata only to complete a matching autonomous Read locator', () => {
    const activations = getTurnSkillActivations([
      ...successfulSkillRead,
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 },
        skill_activations: [
          {
            slug: 'deep-research',
            name: 'Deep Research',
            filePath: '/current/skills/deep-research/SKILL.md',
            workspaceSlug: 'team',
            workspaceSkillPath: 'deep-research/SKILL.md',
            sources: ['read'],
          },
          { slug: 'other-turn', name: 'Other Turn', sources: ['explicit'] },
        ],
      } as unknown as SDKMessage,
    ], {
      type: 'user',
      uuid: 'queued-read',
      parent_tool_use_id: null,
    })

    expect(activations).toEqual([{
      slug: 'deep-research',
      name: 'deep-research',
      filePath: '/workspace/skills/deep-research/SKILL.md',
      workspaceSlug: 'team',
      workspaceSkillPath: 'deep-research/SKILL.md',
      sources: ['read'],
    }])
  })
})
