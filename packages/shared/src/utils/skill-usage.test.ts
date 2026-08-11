import { describe, expect, test } from 'bun:test'
import {
  collectSkillActivations,
  collectSuccessfulSkillReadActivations,
  createSkillActivationFromPath,
  getSkillSlugFromEntryPath,
  mergeSkillActivations,
} from './skill-usage'
import type { SDKMessage, SkillActivation } from '../types/agent'

const readPair = (id: string, path: string, isError = false): SDKMessage[] => [
  {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: path } }],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: id, content: 'result', is_error: isError }],
    },
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
]

describe('Skill usage metadata', () => {
  test('extracts Skill slugs from POSIX and Windows entry paths', () => {
    expect(getSkillSlugFromEntryPath('/workspace/skills/deep-research/SKILL.md')).toBe('deep-research')
    expect(getSkillSlugFromEntryPath('C:\\workspace\\skills\\xlsx\\SKILL.md')).toBe('xlsx')
    expect(getSkillSlugFromEntryPath('/workspace/skills-inactive/xlsx/SKILL.md')).toBeNull()
    expect(getSkillSlugFromEntryPath('/workspace/skills/xlsx/README.md')).toBeNull()
  })

  test('merges duplicate activations and retains the best display name', () => {
    const explicit: SkillActivation = {
      slug: 'deep-research',
      name: 'Deep Research',
      filePath: '/workspace/skills/deep-research/SKILL.md',
      sources: ['explicit'],
    }
    const read = createSkillActivationFromPath('/workspace/skills/deep-research/SKILL.md', 'read')!

    expect(mergeSkillActivations([read], [explicit])).toEqual([{
      slug: 'deep-research',
      name: 'Deep Research',
      filePath: '/workspace/skills/deep-research/SKILL.md',
      sources: ['explicit', 'read'],
    }])
  })

  test('only counts successful Skill Read results', () => {
    const messages = [
      ...readPair('ok', '/workspace/skills/one/SKILL.md'),
      ...readPair('failed', '/workspace/skills/two/SKILL.md', true),
    ]

    expect(collectSuccessfulSkillReadActivations(messages)).toEqual([{
      slug: 'one',
      name: 'one',
      filePath: '/workspace/skills/one/SKILL.md',
      sources: ['read'],
    }])
  })

  test('combines terminal metadata with historical Read fallback when no input metadata exists', () => {
    const messages: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 },
        skill_activations: [{ slug: 'one', name: 'One Skill', sources: ['explicit'] }],
      } as unknown as SDKMessage,
      ...readPair('read-one', '/workspace/skills/one/SKILL.md'),
    ]

    expect(collectSkillActivations(messages)).toEqual([{
      slug: 'one',
      name: 'One Skill',
      filePath: '/workspace/skills/one/SKILL.md',
      sources: ['explicit', 'read'],
    }])
  })

  test('persists a relocatable locator for managed workspace Skills', () => {
    expect(createSkillActivationFromPath(
      '/Users/me/.proma/agent-workspaces/team/skills/deep-research/SKILL.md',
      'explicit',
      'Deep Research',
      'team',
    )).toEqual({
      slug: 'deep-research',
      name: 'Deep Research',
      filePath: '/Users/me/.proma/agent-workspaces/team/skills/deep-research/SKILL.md',
      workspaceSlug: 'team',
      workspaceSkillPath: 'deep-research/SKILL.md',
      sources: ['explicit'],
    })
  })

  test('marks successful managed Skill Reads with a relocatable locator', () => {
    const messages = readPair('read', '/Users/me/.proma/agent-workspaces/team/skills/xlsx/SKILL.md')

    expect(collectSuccessfulSkillReadActivations(messages, {
      workspaceSlug: 'team',
      workspaceSkillsRoot: '/Users/me/.proma/agent-workspaces/team/skills',
    })).toEqual([{
      slug: 'xlsx',
      name: 'xlsx',
      filePath: '/Users/me/.proma/agent-workspaces/team/skills/xlsx/SKILL.md',
      workspaceSlug: 'team',
      workspaceSkillPath: 'xlsx/SKILL.md',
      sources: ['read'],
    }])
  })

  test('prefers per-user metadata over a collapsed terminal result', () => {
    const messages: SDKMessage[] = [
      {
        type: 'user',
        uuid: 'user-a',
        parent_tool_use_id: null,
        skill_activations: [{ slug: 'one', name: 'One', sources: ['explicit'] }],
      } as unknown as SDKMessage,
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 },
        skill_activations: [{ slug: 'two', name: 'Two', sources: ['explicit'] }],
      } as unknown as SDKMessage,
    ]

    expect(collectSkillActivations(messages)).toEqual([
      { slug: 'one', name: 'One', sources: ['explicit'] },
    ])
  })
})
