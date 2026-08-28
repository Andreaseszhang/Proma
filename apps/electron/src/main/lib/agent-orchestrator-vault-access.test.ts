import { describe, expect, test } from 'bun:test'
import { resolveRuntimeAdditionalDirectories } from './agent-orchestrator-vault-access'

describe('resolveRuntimeAdditionalDirectories', () => {
  test('Given Obsidian roots and ordinary attachments When building native permissions Then all valid roots are retained once', () => {
    expect(resolveRuntimeAdditionalDirectories(
      ['/project', '/notes/one'],
      ['/notes/one', '/notes/two'],
    )).toEqual(['/project', '/notes/one', '/notes/two'])
  })

  test('Given an empty or whitespace Vault entry When building native permissions Then it is ignored', () => {
    expect(resolveRuntimeAdditionalDirectories(['/project'], ['', '  '])).toEqual(['/project'])
  })
})
