import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getScratchPadPath } from './config-paths'

const tempRoots: string[] = []

function makeConfigRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'proma-scratch-pad-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true })
  }
})

describe('Scratch Pad Vault migration', () => {
  test('Given a legacy Scratch Pad When its path is requested Then the original Markdown file is moved intact into the default Vault', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const content = Buffer.from('\uFEFF# 旧草稿\r\n\r\n原封不动。\r\n', 'utf-8')
    writeFileSync(legacyPath, content)

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(join(configRoot, 'vault', 'scratch-pad.md'))
    expect(existsSync(legacyPath)).toBe(false)
    expect(readFileSync(resolvedPath)).toEqual(content)
  })

  test('Given an empty Vault target When a legacy Scratch Pad exists Then the legacy Markdown takes over the canonical Vault path', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    const content = Buffer.from('# Legacy draft\r\n', 'utf-8')
    writeFileSync(vaultPath, '')
    writeFileSync(legacyPath, content)

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(vaultPath)
    expect(existsSync(legacyPath)).toBe(false)
    expect(readFileSync(vaultPath)).toEqual(content)
  })

  test('Given a non-empty Vault target When a legacy Scratch Pad exists Then the target is preserved and the legacy file is imported into the Vault', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    const importedPath = join(configRoot, 'vault', 'scratch-pad-imported.md')
    writeFileSync(vaultPath, '# Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(vaultPath)
    expect(existsSync(legacyPath)).toBe(false)
    expect(readFileSync(vaultPath, 'utf-8')).toBe('# Vault draft')
    expect(readFileSync(importedPath, 'utf-8')).toBe('# Legacy draft')
  })

  test('Given an existing imported note When another legacy Scratch Pad is migrated Then a unique imported filename is used', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultPath = getScratchPadPath(configRoot)
    const firstImportedPath = join(configRoot, 'vault', 'scratch-pad-imported.md')
    const secondImportedPath = join(configRoot, 'vault', 'scratch-pad-imported-2.md')
    writeFileSync(vaultPath, '# Vault draft', 'utf-8')
    writeFileSync(firstImportedPath, '# Earlier import', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(vaultPath)
    expect(readFileSync(firstImportedPath, 'utf-8')).toBe('# Earlier import')
    expect(readFileSync(secondImportedPath, 'utf-8')).toBe('# Legacy draft')
  })

  test('Given no previous Scratch Pad When its path is requested Then the default Vault path is ready for first save', () => {
    const configRoot = makeConfigRoot()

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(join(configRoot, 'vault', 'scratch-pad.md'))
    expect(existsSync(join(configRoot, 'vault'))).toBe(true)
  })
})
