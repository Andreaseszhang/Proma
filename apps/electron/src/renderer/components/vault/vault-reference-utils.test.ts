import { describe, expect, test } from 'bun:test'
import {
  findVaultReferenceAt,
  findVaultWikiLinkAt,
  parseVaultReferences,
  resolveVaultWikiLink,
  serializeVaultReference,
} from './vault-reference-utils'

describe('Vault Markdown reference protocol', () => {
  test('Given a Proma reference When serialized and reopened Then readable Markdown and identity metadata remain available', () => {
    const marker = serializeVaultReference({ type: 'session', id: 'session-123', label: 'Vault design' })

    expect(marker).toContain('会话：Vault design')
    expect(marker).toContain('<!--proma:reference:')
    expect(parseVaultReferences(`Before ${marker} after`)).toEqual([
      expect.objectContaining({ type: 'session', id: 'session-123', label: 'Vault design' }),
    ])
    expect(findVaultReferenceAt(marker, 2)).toMatchObject({ type: 'session', id: 'session-123' })
  })

  test('Given Obsidian wikilinks When a unique target exists Then its Markdown path is resolved', () => {
    const files = [
      { relativePath: 'Ideas/Vault Design.md', name: 'Vault Design.md', size: 1, modifiedAt: 0 },
      { relativePath: 'Daily/2026-08-19.md', name: '2026-08-19.md', size: 1, modifiedAt: 0 },
    ]

    expect(findVaultWikiLinkAt('See [[Ideas/Vault Design#MVP|the design]]', 8)).toMatchObject({ target: 'Ideas/Vault Design#MVP|the design' })
    expect(resolveVaultWikiLink('Ideas/Vault Design#MVP|the design', files)).toBe('Ideas/Vault Design.md')
    expect(resolveVaultWikiLink('2026-08-19', files)).toBe('Daily/2026-08-19.md')
  })

  test('Given duplicate note titles When an unqualified wikilink is clicked Then it is not resolved arbitrarily', () => {
    const files = [
      { relativePath: 'Ideas/Plan.md', name: 'Plan.md', size: 1, modifiedAt: 0 },
      { relativePath: 'Daily/Plan.md', name: 'Plan.md', size: 1, modifiedAt: 0 },
    ]

    expect(resolveVaultWikiLink('Plan', files)).toBeNull()
  })
})
