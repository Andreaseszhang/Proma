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

  test('Given the migration target already exists When its path is requested Then neither Markdown file is overwritten', () => {
    const configRoot = makeConfigRoot()
    const legacyPath = join(configRoot, 'scratch-pad.md')
    const vaultDir = join(configRoot, 'vault')
    const vaultPath = getScratchPadPath(configRoot)
    writeFileSync(vaultPath, '# Vault draft', 'utf-8')
    writeFileSync(legacyPath, '# Legacy draft', 'utf-8')

    const resolvedPath = getScratchPadPath(configRoot)

    expect(vaultDir).toBe(join(configRoot, 'vault'))
    expect(resolvedPath).toBe(legacyPath)
    expect(readFileSync(legacyPath, 'utf-8')).toBe('# Legacy draft')
    expect(readFileSync(vaultPath, 'utf-8')).toBe('# Vault draft')
  })

  test('Given no previous Scratch Pad When its path is requested Then the default Vault path is ready for first save', () => {
    const configRoot = makeConfigRoot()

    const resolvedPath = getScratchPadPath(configRoot)

    expect(resolvedPath).toBe(join(configRoot, 'vault', 'scratch-pad.md'))
    expect(existsSync(join(configRoot, 'vault'))).toBe(true)
  })
})
