import { describe, expect, test } from 'bun:test'
import { createPromaAgentsFilesOverride } from './pi-resource-loader-overrides'

describe('Proma Pi agents files override', () => {
  test('filters local Claude and Agents instruction files while keeping unrelated resources', () => {
    const override = createPromaAgentsFilesOverride()

    const result = override({
      agentsFiles: [
        { path: '/project/CLAUDE.md', content: 'local Claude instructions' },
        { path: '/project/AGENTS.md', content: 'local Agent instructions' },
        { path: '/project/nested/AGENTS.MD', content: 'uppercase Agent instructions' },
        { path: '/project/docs/guide.md', content: 'project documentation' },
      ],
    })

    expect(result.agentsFiles).toEqual([
      { path: '/project/docs/guide.md', content: 'project documentation' },
    ])
  })
})
