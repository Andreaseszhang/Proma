import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getScratchPadPath, isRetiredDefaultSkill } from './config-paths'

const tempRoots: string[] = []

function makeConfigRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'proma-scratch-pad-'))
  tempRoots.push(root)
  return root
}

function migratedScratchPads(configRoot: string): string[] {
  return readdirSync(join(configRoot, 'vault'))
    .filter((name) => /^草稿(?: \d+)?\.md$/.test(name))
    .sort()
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true })
  }
})

describe('Default Skill retirement', () => {
  test('Given the removed bundled Vault Skill When startup reconciles default skills Then old copied Vault skill directories are retired', () => {
    expect(isRetiredDefaultSkill('vault')).toBe(true)
    expect(isRetiredDefaultSkill('automation')).toBe(false)
  })
})

describe('Scratch Pad Vault migration', () => {
  test('Given a legacy Scratch Pad and no Vault target When its path is requested Then its bytes are copied intact once and the legacy file is retained', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = join(configRoot, 'vault', 'scratch-pad.md')
    const content = Buffer.from('\uFEFF# 旧草稿\r\n\r\n原封不动。\r\n', 'utf-8')
    writeFileSync(legacyPath, content)

    expect(getScratchPadPath(configRoot)).toBe(vaultPath)
    expect(getScratchPadPath(configRoot)).toBe(vaultPath)

    expect(readFileSync(legacyPath)).toEqual(content)
    expect(readFileSync(join(configRoot, 'vault', '草稿.md'))).toEqual(content)
    expect(existsSync(vaultPath)).toBe(false)
    expect(existsSync(join(configRoot, 'scratch-pad-migration.json'))).toBe(true)
    expect(migratedScratchPads(configRoot)).toEqual(['草稿.md'])
  })

  test('Given a non-empty canonical Vault note When a legacy Scratch Pad exists Then user Vault content is preserved and the legacy note is copied to 草稿.md once', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# User Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    expect(getScratchPadPath(configRoot)).toBe(vaultPath)
    expect(getScratchPadPath(configRoot)).toBe(vaultPath)

    expect(readFileSync(vaultPath, 'utf-8')).toBe('# User Vault draft')
    expect(readFileSync(legacyPath, 'utf-8')).toBe('# Legacy draft')
    expect(migratedScratchPads(configRoot)).toEqual(['草稿.md'])
    expect(readFileSync(join(configRoot, 'vault', '草稿.md'), 'utf-8')).toBe('# Legacy draft')
  })

  test('Given a completed import When the app restarts after the user edits the Vault note Then no additional import is created and the user edit is retained', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# Existing Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# User edit after migration', 'utf-8')

    // A fresh function call represents the next main-process startup against the same persisted config directory.
    expect(getScratchPadPath(configRoot)).toBe(vaultPath)
    expect(readFileSync(vaultPath, 'utf-8')).toBe('# User edit after migration')
    expect(readFileSync(legacyPath, 'utf-8')).toBe('# Legacy draft')
    expect(migratedScratchPads(configRoot)).toEqual(['草稿.md'])
  })

  test('Given a copied legacy note but no persisted marker When its path is requested after restart Then content identity recovers the marker without another Chinese copy', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# Existing Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    getScratchPadPath(configRoot)
    unlinkSync(join(configRoot, 'scratch-pad-migration.json'))

    expect(getScratchPadPath(configRoot)).toBe(vaultPath)
    expect(migratedScratchPads(configRoot)).toEqual(['草稿.md'])
    expect(existsSync(join(configRoot, 'scratch-pad-migration.json'))).toBe(true)
  })

  test('Given a different legacy Scratch Pad body When 草稿.md is occupied Then that distinct content receives one additional non-conflicting Chinese copy', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# Existing Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft one', 'utf-8')

    getScratchPadPath(configRoot)
    writeFileSync(legacyPath, '# Legacy draft two', 'utf-8')
    getScratchPadPath(configRoot)
    writeFileSync(legacyPath, '# Legacy draft three', 'utf-8')
    getScratchPadPath(configRoot)
    getScratchPadPath(configRoot)

    expect(readFileSync(vaultPath, 'utf-8')).toBe('# Existing Vault draft')
    expect(migratedScratchPads(configRoot)).toEqual(['草稿 2.md', '草稿 3.md', '草稿.md'])
    expect(readFileSync(join(configRoot, 'vault', '草稿 2.md'), 'utf-8')).toBe('# Legacy draft two')
    expect(readFileSync(join(configRoot, 'vault', '草稿 3.md'), 'utf-8')).toBe('# Legacy draft three')
  })

  test('Given an external Vault selection When a legacy Scratch Pad is migrated Then it still uses only the managed default Vault', () => {
    const configRoot = makeConfigRoot()
    const externalVault = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    writeFileSync(join(configRoot, 'vault.json'), JSON.stringify({ rootPath: externalVault }))
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(join(configRoot, 'vault', 'scratch-pad.md'))
    expect(readFileSync(join(configRoot, 'vault', '草稿.md'), 'utf-8')).toBe('# Legacy draft')
    expect(existsSync(join(externalVault, 'scratch-pad.md'))).toBe(false)
    expect(existsSync(join(externalVault, '草稿.md'))).toBe(false)
  })

  test('Given no previous Scratch Pad When its path is requested Then the managed Vault path is ready for first save', () => {
    const configRoot = makeConfigRoot()

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(join(configRoot, 'vault', 'scratch-pad.md'))
    expect(existsSync(join(configRoot, 'vault'))).toBe(true)
  })
})
