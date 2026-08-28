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

  test('Given a completed Agent turn with Vault focus When its footer is rendered Then the Obsidian icon is used only as context attribution', () => {
    const componentRoot = join(import.meta.dir, '..')
    const sidePanelSource = readFileSync(join(componentRoot, 'agent', 'SidePanel.tsx'), 'utf-8')
    const turnSummarySource = readFileSync(join(componentRoot, 'agent', 'TurnSkillUsageSummary.tsx'), 'utf-8')
    const vaultViewSource = readFileSync(join(componentRoot, 'vault', 'VaultView.tsx'), 'utf-8')

    expect(sidePanelSource).toContain('OBSIDIAN_NAME')
    expect(sidePanelSource).toContain('ObsidianIcon')
    expect(turnSummarySource).toContain('VaultFocusChip')
    expect(turnSummarySource).toContain('ObsidianIcon')
    expect(turnSummarySource).toContain('不代表 Agent 已读取或编辑')
    expect(vaultViewSource).toContain("const VAULT_NAME = 'Vault'")
    expect(vaultViewSource).toContain('BookOpen')
    expect(vaultViewSource).not.toContain('OBSIDIAN_NAME')
    expect(vaultViewSource).not.toContain('ObsidianIcon')
  })
})
