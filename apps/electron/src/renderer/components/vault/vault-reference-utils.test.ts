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

    expect(marker).toContain('&session:session-123::Vault%20design')
    expect(marker).toContain('<!--proma:reference:')
    expect(parseVaultReferences(`Before ${marker} after`)).toEqual([
      expect.objectContaining({ type: 'session', id: 'session-123', label: 'Vault design' }),
    ])
    expect(findVaultReferenceAt(marker, 2)).toMatchObject({ type: 'session', id: 'session-123' })
  })

  test('Given each Proma trigger type When serialized Then canonical readable markers remain parseable', () => {
    const references = [
      [{ type: 'skill', id: 'daily-review', label: 'Daily review' }, '/skill:daily-review'],
      [{ type: 'mcp', id: 'playwright', label: 'Playwright' }, '#mcp:playwright'],
      [{ type: 'session', id: 'session-123', label: 'Vault design' }, '&session:session-123::Vault%20design'],
      [{ type: 'todo', id: 'todo-123', label: 'Ship Vault' }, '&todo:todo-123::Ship%20Vault'],
      [{ type: 'calendar_event', id: 'event-123', label: 'Demo' }, '&calendar_event:event-123::Demo'],
    ] as const

    for (const [reference, marker] of references) {
      const serialized = serializeVaultReference(reference)
      expect(serialized).toContain(marker)
      expect(parseVaultReferences(serialized)).toEqual([
        expect.objectContaining(reference),
      ])
    }
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
