import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

describe('limited Obsidian UI branding', () => {
  test('Given an allowed Vault entry point When its brand is rendered Then Obsidian is available and the managed storage label remains explicit', () => {
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

  test('Given user-visible Vault actions When their source is checked Then only the two permitted entry points use the Obsidian name and icon', () => {
    const componentRoot = join(import.meta.dir, '..')
    const allowedEntrySources = [
      join(componentRoot, 'agent', 'SidePanel.tsx'),
      join(componentRoot, 'app-shell', 'LeftSidebar.tsx'),
    ].map((path) => readFileSync(path, 'utf-8')).join('\n')
    const selectionSource = readFileSync(join(componentRoot, 'selection', 'SelectionActionPopover.tsx'), 'utf-8')
    const vaultViewSource = readFileSync(join(componentRoot, 'vault', 'VaultView.tsx'), 'utf-8')

    expect(allowedEntrySources).toContain('OBSIDIAN_NAME')
    expect(allowedEntrySources).toContain('ObsidianIcon')
    expect(selectionSource).toContain('引用到 Vault')
    expect(selectionSource).toContain('BookOpen')
    expect(selectionSource).not.toContain('OBSIDIAN_NAME')
    expect(selectionSource).not.toContain('ObsidianIcon')
    expect(vaultViewSource).toContain("const VAULT_NAME = 'Vault'")
    expect(vaultViewSource).toContain('BookOpen')
    expect(vaultViewSource).not.toContain('OBSIDIAN_NAME')
    expect(vaultViewSource).not.toContain('ObsidianIcon')
  })
})
