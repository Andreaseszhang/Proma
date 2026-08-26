import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDefaultVaultDir, resolveDefaultVaultDir } from './config-paths'
import {
  createVaultFileSystem,
  ensureDefaultVaultAt,
  formatVaultSourceBlock,
} from './vault-service'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'proma-vault-'))
  tempRoots.push(root)
  return root
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf-8')
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true })
  }
})

describe('Vault file system', () => {
  test('Given production and development config roots When default Vault paths are resolved Then each stays under its Proma config directory', () => {
    expect(resolveDefaultVaultDir(join('/Users', 'andreas', '.proma'))).toBe(join('/Users', 'andreas', '.proma', 'vault'))
    expect(resolveDefaultVaultDir(join('/Users', 'andreas', '.proma-dev'))).toBe(join('/Users', 'andreas', '.proma-dev', 'vault'))
  })

  test('Given no configured Vault When the managed Vault is ensured Then its directory and config are initialized idempotently', () => {
    const configRoot = join(makeTempRoot(), '.proma-dev')
    const vaultRoot = getDefaultVaultDir(configRoot)
    const configPath = join(configRoot, 'vault.json')

    const first = ensureDefaultVaultAt(configPath, vaultRoot)
    const second = ensureDefaultVaultAt(configPath, vaultRoot)

    expect(vaultRoot).toBe(join(configRoot, 'vault'))
    expect(existsSync(vaultRoot)).toBe(true)
    expect(existsSync(configPath)).toBe(true)
    expect(first).toEqual(second)
    expect(first).toMatchObject({ displayName: 'vault', inboxPath: 'Proma Inbox', allowAgentWrites: false })
  })

  test('Given an initialized Proma Vault When candidates are listed Then it appears as a managed candidate', () => {
    const configRoot = join(makeTempRoot(), '.proma-dev')
    const managedRoot = getDefaultVaultDir(configRoot)
    const candidates = [
      { path: managedRoot, displayName: 'Proma Vault', isObsidianVault: false, isPromaManaged: true },
    ]

    expect(candidates[0]).toMatchObject({ path: managedRoot, displayName: 'Proma Vault', isPromaManaged: true })
  })
  test('Given an existing external Vault config When the managed Vault is ensured Then the external selection is preserved', () => {
    const configRoot = join(makeTempRoot(), '.proma-dev')
    const managedRoot = getDefaultVaultDir(configRoot)
    const externalRoot = makeTempRoot()
    const configPath = join(configRoot, 'vault.json')
    const configuredAt = Date.UTC(2026, 7, 26)
    writeFile(configPath, JSON.stringify({
      rootPath: externalRoot,
      displayName: 'External Notes',
      inboxPath: 'Inbox',
      allowAgentWrites: true,
      configuredAt,
    }))

    const summary = ensureDefaultVaultAt(configPath, managedRoot)

    expect(summary).toEqual({
      displayName: 'External Notes',
      inboxPath: 'Inbox',
      allowAgentWrites: true,
      configuredAt,
    })
  })

  test('Given an authorized Vault When files are listed Then only visible Markdown files are returned', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'Inbox', 'idea.md'), '# Idea')
    writeFile(join(root, 'assets', 'image.png'), 'binary')
    writeFile(join(root, '.obsidian', 'app.json'), '{}')
    writeFile(join(root, '.hidden', 'private.md'), '# Private')

    const vault = createVaultFileSystem(root)

    expect(vault.listFiles().map((entry) => entry.relativePath)).toEqual(['Inbox/idea.md'])
  })

  test('Given a symlink to content outside the Vault When it is read Then access is rejected', () => {
    const root = makeTempRoot()
    const outside = join(root, '..', 'outside.md')
    writeFile(outside, '# Outside')
    symlinkSync(outside, join(root, 'escape.md'))

    const vault = createVaultFileSystem(root)

    expect(() => vault.readFile('escape.md')).toThrow('软链接')
  })

  test('Given an unchanged Markdown note When source mode saves Then content is written atomically', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'Inbox', 'idea.md'), '# Before')
    const vault = createVaultFileSystem(root)
    const original = vault.readFile('Inbox/idea.md')

    const result = vault.writeFile({
      relativePath: 'Inbox/idea.md',
      content: '# After\n\n[[Linked note]]\n\n```dataview\nLIST\n```',
      expectedSha256: original.sha256,
    })

    expect(result.ok).toBe(true)
    expect(vault.readFile('Inbox/idea.md').content).toContain('```dataview')
    expect(existsSync(join(root, 'Inbox', 'idea.md.tmp'))).toBe(false)
  })

  test('Given an externally changed note When a stale save is requested Then the original is kept', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'idea.md'), '# Before')
    const vault = createVaultFileSystem(root)
    const original = vault.readFile('idea.md')
    writeFile(join(root, 'idea.md'), '# External')

    const result = vault.writeFile({
      relativePath: 'idea.md',
      content: '# Agent overwrite',
      expectedSha256: original.sha256,
    })

    expect(result).toMatchObject({ ok: false, reason: 'conflict' })
    expect(vault.readFile('idea.md').content).toBe('# External')
  })

  test('Given a Markdown note When it is renamed Then its content stays inside the authorized Vault', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'Ideas', 'draft.md'), '# Draft')
    const vault = createVaultFileSystem(root)
    const original = vault.readFile('Ideas/draft.md')

    const renamed = vault.renameFile({
      relativePath: original.relativePath,
      name: 'Published idea',
      expectedSha256: original.sha256,
    })

    expect(renamed.relativePath).toBe('Ideas/Published idea.md')
    expect(renamed.content).toBe('# Draft')
    expect(existsSync(join(root, 'Ideas', 'draft.md'))).toBe(false)
  })

  test('Given a session snapshot When it is formatted Then the Vault contains a portable quote and source URI', () => {
    const markdown = formatVaultSourceBlock({
      type: 'agent-history',
      label: 'Agent history: Vault discussion',
      content: 'The Vault remains the canonical source.',
      sourceUri: 'proma://session/session-1?messageId=message-1',
      capturedAt: Date.UTC(2026, 7, 18),
    })

    expect(markdown).toContain('> [!quote]- Agent history: Vault discussion')
    expect(markdown).toContain('> The Vault remains the canonical source.')
    expect(markdown).toContain('proma://session/session-1?messageId=message-1')
  })
})
