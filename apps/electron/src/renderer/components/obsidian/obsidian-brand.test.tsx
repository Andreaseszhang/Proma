import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

describe('Obsidian UI branding', () => {
  test('Given the Vault-backed workspace When its brand is rendered Then Obsidian is the primary name and the managed storage label remains explicit', () => {
    const source = readFileSync(join(import.meta.dir, 'obsidian-brand.tsx'), 'utf-8')

    expect(source).toContain("OBSIDIAN_NAME = 'Obsidian'")
    expect(source).toContain("PROMA_MANAGED_VAULT_LABEL = 'Proma Vault'")
  })

  test('Given light or dark theme text colors When the Obsidian icon renders Then it inherits color and keeps a stable square view box', () => {
    const source = readFileSync(join(import.meta.dir, 'obsidian-brand.tsx'), 'utf-8')

    expect(source).toContain("viewBox: '0 0 24 24'")
    expect(source).toContain('width: size')
    expect(source).toContain('height: size')
    expect(source).toContain("fill: 'currentColor'")
    expect(source).toContain("'aria-hidden': true")
  })

  test('Given user-visible Obsidian entry points When their source is checked Then the shared name and icon replace Vault labels and book icons', () => {
    const componentRoot = join(import.meta.dir, '..')
    const sources = [
      join(componentRoot, 'agent', 'SidePanel.tsx'),
      join(componentRoot, 'app-shell', 'LeftSidebar.tsx'),
      join(componentRoot, 'selection', 'SelectionActionPopover.tsx'),
      join(componentRoot, 'vault', 'VaultView.tsx'),
    ].map((path) => readFileSync(path, 'utf-8')).join('\n')

    expect(sources).toContain('OBSIDIAN_NAME')
    expect(sources).toContain('ObsidianIcon')
    expect(sources).not.toMatch(/label=(?:"Vault"|\{'Vault'\})/)
    expect(sources).not.toContain("label: 'Vault'")
    expect(sources).not.toContain('引用到 Vault')
    expect(sources).not.toContain('BookOpen')
  })
})
