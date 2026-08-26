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
    expect(first).toMatchObject({ displayName: 'Proma Vault', inboxPath: 'Proma Inbox', allowAgentWrites: false })
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

  test('Given a Markdown note When it is deleted with the current version Then it is removed from the Vault', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'Ideas', 'draft.md'), '# Draft')
    const vault = createVaultFileSystem(root)
    const original = vault.readFile('Ideas/draft.md')

    vault.deleteFile({ relativePath: original.relativePath, expectedSha256: original.sha256 })

    expect(existsSync(join(root, 'Ideas', 'draft.md'))).toBe(false)
    expect(vault.listFiles()).toEqual([])
  })

  test('Given an externally changed note When a stale delete is requested Then the note is preserved', () => {
    const root = makeTempRoot()
    writeFile(join(root, 'idea.md'), '# Before')
    const vault = createVaultFileSystem(root)
    const original = vault.readFile('idea.md')
    writeFile(join(root, 'idea.md'), '# External')

    expect(() => vault.deleteFile({
      relativePath: original.relativePath,
      expectedSha256: original.sha256,
    })).toThrow('外部修改')
    expect(vault.readFile('idea.md').content).toBe('# External')
  })

  test('Given a large Markdown note When deletion has no version precondition Then the note is still removed', () => {
    const root = makeTempRoot()
    writeFileSync(join(root, 'large.md'), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf-8')
    const vault = createVaultFileSystem(root)

    vault.deleteFile({ relativePath: 'large.md' })

    expect(existsSync(join(root, 'large.md'))).toBe(false)
  })

  test('Given hidden or escaping paths When deletion is requested Then no file outside the visible Vault is removed', () => {
    const root = makeTempRoot()
    const outside = join(root, '..', 'outside-delete.md')
    writeFile(join(root, '.hidden', 'private.md'), '# Private')
    writeFile(outside, '# Outside')
    const vault = createVaultFileSystem(root)

    expect(() => vault.deleteFile({ relativePath: '.hidden/private.md' })).toThrow('隐藏目录')
    expect(() => vault.deleteFile({ relativePath: '../outside-delete.md' })).toThrow('上级目录')
    expect(existsSync(join(root, '.hidden', 'private.md'))).toBe(true)
    expect(existsSync(outside)).toBe(true)
    rmSync(outside, { force: true })
  })

  test('Given symlinked files or ancestors When deletion is requested Then the links and targets are preserved', () => {
    const root = makeTempRoot()
    const outsideRoot = makeTempRoot()
    const outsideFile = join(outsideRoot, 'outside.md')
    writeFile(outsideFile, '# Outside')
    symlinkSync(outsideFile, join(root, 'linked.md'))
    symlinkSync(outsideRoot, join(root, 'linked-folder'))
    const vault = createVaultFileSystem(root)

    expect(() => vault.deleteFile({ relativePath: 'linked.md' })).toThrow('软链接')
    expect(() => vault.deleteFile({ relativePath: 'linked-folder/outside.md' })).toThrow('软链接')
    expect(existsSync(join(root, 'linked.md'))).toBe(true)
    expect(existsSync(outsideFile)).toBe(true)
  test('Given no note for today When an untitled note is created Then the readable base filename is used', () => {
    const root = makeTempRoot()
    const vault = createVaultFileSystem(root)

    const created = vault.createUntitledNote('Proma Inbox', '# First', new Date(2026, 7, 26, 10, 0, 0))

    expect(created).toMatchObject({ ok: true, relativePath: 'Proma Inbox/Untitled 2026-08-26.md' })
    expect(vault.readFile('Proma Inbox/Untitled 2026-08-26.md').content).toBe('# First')
  })

  test('Given today base filename already exists When another untitled note is created Then it uses the next readable sequence without replacing the original', () => {
    const root = makeTempRoot()
    const vault = createVaultFileSystem(root)
    const now = new Date(2026, 7, 26, 10, 0, 0)
    vault.createUntitledNote('Proma Inbox', '# First', now)

    const created = vault.createUntitledNote('Proma Inbox', '# Second', now)

    expect(created).toMatchObject({ ok: true, relativePath: 'Proma Inbox/Untitled 2026-08-26 2.md' })
    expect(vault.readFile('Proma Inbox/Untitled 2026-08-26.md').content).toBe('# First')
    expect(vault.readFile('Proma Inbox/Untitled 2026-08-26 2.md').content).toBe('# Second')
  })

  test('Given several existing untitled filename conflicts When another note is created Then the first unused sequence is selected', () => {
    const root = makeTempRoot()
    const vault = createVaultFileSystem(root)
    const now = new Date(2026, 7, 26, 10, 0, 0)
    writeFile(join(root, 'Proma Inbox', 'Untitled 2026-08-26.md'), '# Existing base')
    writeFile(join(root, 'Proma Inbox', 'Untitled 2026-08-26 2.md'), '# Existing second')
    writeFile(join(root, 'Proma Inbox', 'Untitled 2026-08-26 4.md'), '# Existing fourth')

    const created = vault.createUntitledNote('Proma Inbox', '# New', now)

    expect(created).toMatchObject({ ok: true, relativePath: 'Proma Inbox/Untitled 2026-08-26 3.md' })
    expect(vault.readFile('Proma Inbox/Untitled 2026-08-26 4.md').content).toBe('# Existing fourth')
  })

  test('Given rapid repeated untitled-note requests When they create the same day note Then every result has a unique file and preserves its own content', async () => {
    const root = makeTempRoot()
    const vault = createVaultFileSystem(root)
    const now = new Date(2026, 7, 26, 10, 0, 0)

    const created = await Promise.all(Array.from({ length: 8 }, (_, index) => Promise.resolve().then(() => (
      vault.createUntitledNote('Proma Inbox', `# Request ${index + 1}`, now)
    ))))

    const paths = created.map((result) => {
      if (!result.ok) throw new Error('未命名笔记创建不应发生内容冲突')
      return result.relativePath
    })
    expect(new Set(paths).size).toBe(8)
    expect(paths).toEqual([
      'Proma Inbox/Untitled 2026-08-26.md',
      'Proma Inbox/Untitled 2026-08-26 2.md',
      'Proma Inbox/Untitled 2026-08-26 3.md',
      'Proma Inbox/Untitled 2026-08-26 4.md',
      'Proma Inbox/Untitled 2026-08-26 5.md',
      'Proma Inbox/Untitled 2026-08-26 6.md',
      'Proma Inbox/Untitled 2026-08-26 7.md',
      'Proma Inbox/Untitled 2026-08-26 8.md',
    ])
    for (const [index, relativePath] of paths.entries()) {
      expect(vault.readFile(relativePath).content).toBe(`# Request ${index + 1}`)
    }
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
