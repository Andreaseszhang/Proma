import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type {
  VaultCandidate,
  VaultConfig,
  VaultFileEntry,
  VaultReadResult,
  VaultRenameInput,
  VaultSearchResult,
  VaultSourceSnapshot,
  VaultSummary,
  VaultWriteInput,
  VaultWriteResult,
} from '@proma/shared'
import { getDefaultVaultDir, getVaultConfigPath, resolveDefaultVaultDir } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic, writeTextFileAtomic } from './safe-file'

const MAX_VAULT_FILE_BYTES = 2 * 1024 * 1024
const MAX_VAULT_FILES = 5_000
const MAX_VAULT_DEPTH = 16
const HIDDEN_DIRECTORY_PREFIX = '.'

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function normalizeRelativeMarkdownPath(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error('Vault 相对路径不能为空')
  }
  if (isAbsolute(value) || isWindowsAbsolutePath(value)) {
    throw new Error('Vault 不接受绝对路径')
  }

  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '')
  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith(HIDDEN_DIRECTORY_PREFIX))) {
    throw new Error('Vault 路径不能包含隐藏目录、空段或上级目录')
  }
  if (!normalized.toLowerCase().endsWith('.md')) {
    throw new Error('Vault 仅支持 Markdown (.md) 文件')
  }
  return parts.join('/')
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const fromRoot = relative(rootPath, targetPath)
  return fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))
}

function assertVaultRoot(rootPath: string): string {
  const resolved = realpathSync(resolve(rootPath))
  if (!statSync(resolved).isDirectory()) {
    throw new Error('Vault 根路径不是目录')
  }
  return resolved
}

function getSafeVaultTarget(rootPath: string, relativePath: string): { absolutePath: string; relativePath: string } {
  const normalizedRelativePath = normalizeRelativeMarkdownPath(relativePath)
  const absolutePath = resolve(rootPath, normalizedRelativePath)
  if (!isWithinRoot(rootPath, absolutePath)) {
    throw new Error('Vault 路径超出授权根目录')
  }

  let current = rootPath
  for (const segment of normalizedRelativePath.split('/')) {
    current = join(current, segment)
    if (!existsSync(current)) continue
    const stats = lstatSync(current)
    if (stats.isSymbolicLink()) {
      throw new Error('Vault 不允许通过软链接访问文件')
    }
  }

  return { absolutePath, relativePath: normalizedRelativePath }
}

function toRelativePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(/[/\\]/).join('/')
}

function titleForMarkdown(content: string, fallback: string): string {
  const heading = content.split(/\r?\n/).find((line) => /^#{1,6}\s+/.test(line))
  return heading ? heading.replace(/^#{1,6}\s+/, '').trim() : fallback
}

function readableSnippet(content: string, query: string): { snippet: string; line: number } | null {
  const lowerQuery = query.toLowerCase()
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]!.toLowerCase().includes(lowerQuery)) {
      const start = Math.max(0, index - 1)
      const end = Math.min(lines.length, index + 2)
      return { snippet: lines.slice(start, end).join(' ').trim().slice(0, 320), line: index + 1 }
    }
  }
  return null
}

export interface VaultUserContextSnapshot {
  rootPath: string
  displayName: string
  relativePath: string | null
  allowAgentWrites: boolean
  openedAt: number
}

const vaultUserContextBySession = new Map<string, VaultUserContextSnapshot>()

export function setVaultUserContext(sessionId: string, relativePath: string | null): void {
  if (!sessionId) return
  const config = getVaultConfig()
  if (!config) {
    vaultUserContextBySession.delete(sessionId)
    return
  }
  vaultUserContextBySession.set(sessionId, {
    rootPath: config.rootPath,
    displayName: config.displayName,
    relativePath: relativePath?.trim() || null,
    allowAgentWrites: config.allowAgentWrites,
    openedAt: Date.now(),
  })
}

export function clearVaultUserContext(sessionId: string): void {
  vaultUserContextBySession.delete(sessionId)
}

export function getVaultUserContext(sessionId: string): VaultUserContextSnapshot | null {
  const context = vaultUserContextBySession.get(sessionId)
  const config = getVaultConfig()
  if (!context || !config) return null
  return {
    ...context,
    rootPath: config.rootPath,
    displayName: config.displayName,
    allowAgentWrites: config.allowAgentWrites,
  }
}

export interface VaultFileSystem {
  listFiles(): VaultFileEntry[]
  readFile(relativePath: string): VaultReadResult
  writeFile(input: VaultWriteInput): VaultWriteResult
  renameFile(input: VaultRenameInput): VaultReadResult
  search(query: string, limit?: number): VaultSearchResult[]
}

/** Creates a bounded filesystem facade for one already-authorized Vault root. */
export function createVaultFileSystem(rootPath: string): VaultFileSystem {
  const root = assertVaultRoot(rootPath)

  const listFiles = (): VaultFileEntry[] => {
    const entries: VaultFileEntry[] = []

    const walk = (currentDir: string, depth: number): void => {
      if (depth > MAX_VAULT_DEPTH || entries.length >= MAX_VAULT_FILES) return
      let dirEntries: import('node:fs').Dirent[]
      try {
        dirEntries = readdirSync(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of dirEntries) {
        if (entries.length >= MAX_VAULT_FILES || entry.name.startsWith(HIDDEN_DIRECTORY_PREFIX) || entry.isSymbolicLink()) continue
        const absolutePath = join(currentDir, entry.name)
        if (entry.isDirectory()) {
          walk(absolutePath, depth + 1)
          continue
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
        const stats = statSync(absolutePath)
        entries.push({
          relativePath: toRelativePath(root, absolutePath),
          name: entry.name,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        })
      }
    }

    walk(root, 0)
    return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }

  const readFile = (relativePath: string): VaultReadResult => {
    const target = getSafeVaultTarget(root, relativePath)
    if (!existsSync(target.absolutePath)) throw new Error(`Vault 文件不存在: ${target.relativePath}`)
    const stats = lstatSync(target.absolutePath)
    if (!stats.isFile()) throw new Error('Vault 目标不是普通文件')
    if (stats.size > MAX_VAULT_FILE_BYTES) throw new Error('Vault 文件超过 2 MB 读取上限')
    const content = readFileSync(target.absolutePath, 'utf-8')
    return {
      relativePath: target.relativePath,
      content,
      sha256: sha256(content),
      modifiedAt: stats.mtimeMs,
    }
  }

  const writeFile = (input: VaultWriteInput): VaultWriteResult => {
    if (Buffer.byteLength(input.content, 'utf-8') > MAX_VAULT_FILE_BYTES) {
      throw new Error('Vault 写入内容超过 2 MB 限制')
    }
    const target = getSafeVaultTarget(root, input.relativePath)
    const exists = existsSync(target.absolutePath)
    if (exists) {
      const current = readFile(target.relativePath)
      if (input.createOnly) throw new Error(`Vault 文件已存在: ${target.relativePath}`)
      if (input.expectedSha256 && input.expectedSha256 !== current.sha256) {
        return { ok: false, reason: 'conflict', currentSha256: current.sha256, currentModifiedAt: current.modifiedAt }
      }
    } else if (input.expectedSha256) {
      throw new Error('Vault 文件已不存在，无法按预期版本写入')
    }

    mkdirSync(dirname(target.absolutePath), { recursive: true })
    // Directory creation introduces new ancestors, so validate again before the atomic write.
    const revalidated = getSafeVaultTarget(root, target.relativePath)
    writeTextFileAtomic(revalidated.absolutePath, input.content)
    const result = readFile(revalidated.relativePath)
    return { ok: true, relativePath: result.relativePath, sha256: result.sha256, modifiedAt: result.modifiedAt }
  }

  const renameFile = (input: VaultRenameInput): VaultReadResult => {
    const source = getSafeVaultTarget(root, input.relativePath)
    const current = readFile(source.relativePath)
    if (input.expectedSha256 && input.expectedSha256 !== current.sha256) {
      throw new Error('文件已在外部修改，请刷新后再重命名')
    }

    const requestedName = input.name.trim()
    if (!requestedName || requestedName.includes('/') || requestedName.includes('\\') || requestedName.includes('\0')) {
      throw new Error('文件名不能为空且不能包含路径分隔符')
    }
    const filename = requestedName.toLowerCase().endsWith('.md') ? requestedName : `${requestedName}.md`
    const parentPath = source.relativePath.includes('/') ? source.relativePath.slice(0, source.relativePath.lastIndexOf('/')) : ''
    const target = getSafeVaultTarget(root, parentPath ? `${parentPath}/${filename}` : filename)
    if (target.relativePath === source.relativePath) return current
    if (existsSync(target.absolutePath)) throw new Error('同名 Markdown 文件已存在')

    mkdirSync(dirname(target.absolutePath), { recursive: true })
    const revalidatedTarget = getSafeVaultTarget(root, target.relativePath)
    renameSync(source.absolutePath, revalidatedTarget.absolutePath)
    return readFile(revalidatedTarget.relativePath)
  }

  const search = (query: string, limit = 20): VaultSearchResult[] => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return []
    const boundedLimit = Math.max(1, Math.min(limit, 50))
    const results: VaultSearchResult[] = []
    for (const entry of listFiles()) {
      if (results.length >= boundedLimit) break
      const content = readFile(entry.relativePath).content
      const match = readableSnippet(content, normalizedQuery)
      const nameMatch = entry.name.toLowerCase().includes(normalizedQuery)
      if (!match && !nameMatch) continue
      results.push({
        relativePath: entry.relativePath,
        title: titleForMarkdown(content, entry.name.replace(/\.md$/i, '')),
        snippet: match?.snippet ?? entry.relativePath,
        line: match?.line ?? 1,
        modifiedAt: entry.modifiedAt,
      })
    }
    return results
  }

  return { listFiles, readFile, writeFile, renameFile, search }
}

function sanitizeQuoteLabel(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim().replace(/\]/g, '\\]')
}

function toQuoteLine(value: string): string {
  return `> ${value}`
}

/** Formats a portable Obsidian-compatible callout instead of Proma's prompt-only XML quote format. */
export function formatVaultSourceBlock(source: VaultSourceSnapshot): string {
  const timestamp = new Date(source.capturedAt).toISOString()
  const contentLines = source.content.replace(/\r\n/g, '\n').split('\n')
  const quotedContent = contentLines.map((line) => toQuoteLine(line)).join('\n')
  return [
    `> [!quote]- ${sanitizeQuoteLabel(source.label)}`,
    quotedContent,
    '>',
    `> Source: ${source.sourceUri}`,
    `> Captured: ${timestamp}`,
  ].join('\n')
}

function parseVaultConfig(value: unknown): VaultConfig | null {
  if (!value || typeof value !== 'object') return null
  const config = value as Record<string, unknown>
  if (
    typeof config.rootPath !== 'string'
    || typeof config.displayName !== 'string'
    || typeof config.inboxPath !== 'string'
    || typeof config.allowAgentWrites !== 'boolean'
    || typeof config.configuredAt !== 'number'
  ) {
    return null
  }
  try {
    const rootPath = assertVaultRoot(config.rootPath)
    return {
      rootPath,
      displayName: config.displayName,
      inboxPath: normalizeRelativeMarkdownPath(join(config.inboxPath, 'placeholder.md')).replace(/\/placeholder\.md$/, ''),
      allowAgentWrites: config.allowAgentWrites,
      configuredAt: config.configuredAt,
    }
  } catch {
    return null
  }
}

export function getVaultConfig(): VaultConfig | null {
  return parseVaultConfig(readJsonFileSafe<unknown>(getVaultConfigPath()))
}

export function getVaultSummary(): VaultSummary | null {
  const config = getVaultConfig()
  if (!config) return null
  return {
    displayName: config.displayName,
    inboxPath: config.inboxPath,
    allowAgentWrites: config.allowAgentWrites,
    configuredAt: config.configuredAt,
  }
}

function vaultSummary(config: VaultConfig): VaultSummary {
  return {
    displayName: config.displayName,
    inboxPath: config.inboxPath,
    allowAgentWrites: config.allowAgentWrites,
    configuredAt: config.configuredAt,
  }
}

function configureVaultAt(rootPath: string, configPath: string, options: { inboxPath?: string; allowAgentWrites?: boolean } = {}): VaultSummary {
  const root = assertVaultRoot(rootPath)
  const inboxPath = options.inboxPath?.trim() || 'Proma Inbox'
  const normalizedInboxPath = normalizeRelativeMarkdownPath(join(inboxPath, 'placeholder.md')).replace(/\/placeholder\.md$/, '')
  const config: VaultConfig = {
    rootPath: root,
    displayName: basename(root) || 'Vault',
    inboxPath: normalizedInboxPath,
    allowAgentWrites: options.allowAgentWrites === true,
    configuredAt: Date.now(),
  }
  writeJsonFileAtomic(configPath, config)
  return vaultSummary(config)
}

export function configureVault(rootPath: string, options: { inboxPath?: string; allowAgentWrites?: boolean } = {}): VaultSummary {
  return configureVaultAt(rootPath, getVaultConfigPath(), options)
}

export function ensureDefaultVaultAt(configPath: string, rootPath: string): VaultSummary {
  const current = parseVaultConfig(readJsonFileSafe<unknown>(configPath))
  if (current) return vaultSummary(current)
  return configureVaultAt(rootPath, configPath, { inboxPath: 'Proma Inbox', allowAgentWrites: false })
}

export function selectDefaultVault(): VaultSummary {
  return configureVault(getDefaultVaultDir(), { inboxPath: 'Proma Inbox', allowAgentWrites: false })
}

/** 确保 Vault 页面可直接使用 Proma 管理的本地 Markdown 目录，且不改变已有选择。 */
export function ensureDefaultVault(): VaultSummary {
  const managedRoot = getDefaultVaultDir()
  const current = getVaultConfig()
  if (current) return vaultSummary(current)
  return ensureDefaultVaultAt(getVaultConfigPath(), managedRoot)
}

export function authorizeDiscoveredVault(rootPath: string, options: { inboxPath?: string; allowAgentWrites?: boolean } = {}): VaultSummary {
  const candidate = discoverObsidianVaultCandidates().find((item) => item.path === rootPath)
  if (!candidate) throw new Error('Vault 候选已失效，请通过系统文件夹选择器重新授权')
  return configureVault(candidate.path, options)
}

export function updateVaultConfig(options: { inboxPath?: string; allowAgentWrites?: boolean }): VaultSummary {
  const current = getVaultConfig()
  if (!current) throw new Error('尚未选择 Vault')
  const inboxPath = options.inboxPath === undefined
    ? current.inboxPath
    : normalizeRelativeMarkdownPath(join(options.inboxPath, 'placeholder.md')).replace(/\/placeholder\.md$/, '')
  const config: VaultConfig = {
    ...current,
    inboxPath,
    allowAgentWrites: options.allowAgentWrites ?? current.allowAgentWrites,
  }
  writeJsonFileAtomic(getVaultConfigPath(), config)
  return {
    displayName: config.displayName,
    inboxPath: config.inboxPath,
    allowAgentWrites: config.allowAgentWrites,
    configuredAt: config.configuredAt,
  }
}

export function clearVaultConfig(): void {
  const path = getVaultConfigPath()
  if (existsSync(path)) unlinkSync(path)
  vaultUserContextBySession.clear()
}

export function getConfiguredVaultFileSystem(): VaultFileSystem {
  const config = getVaultConfig()
  if (!config) throw new Error('尚未选择 Vault')
  return createVaultFileSystem(config.rootPath)
}

export function discoverVaultCandidates(): VaultCandidate[] {
  const managedRootPath = resolveDefaultVaultDir(dirname(getVaultConfigPath()))
  let managedRoot: string | null = null
  try {
    managedRoot = existsSync(managedRootPath) ? assertVaultRoot(managedRootPath) : null
  } catch {
    managedRoot = null
  }
  const candidates: VaultCandidate[] = managedRoot
    ? [{ path: managedRoot, displayName: 'Proma Vault', isObsidianVault: existsSync(join(managedRoot, '.obsidian')), isPromaManaged: true }]
    : []
  return [...candidates, ...discoverObsidianVaultCandidates()]
}

export function discoverObsidianVaultCandidates(): VaultCandidate[] {
  const configPaths = platform() === 'darwin'
    ? [join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json')]
    : platform() === 'win32'
      ? [join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')]
      : [join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'obsidian', 'obsidian.json')]
  const managedRootPath = resolveDefaultVaultDir(dirname(getVaultConfigPath()))
  let managedRoot: string | null = null
  try {
    managedRoot = existsSync(managedRootPath) ? assertVaultRoot(managedRootPath) : null
  } catch {
    managedRoot = null
  }
  const candidates = new Map<string, VaultCandidate>()

  for (const configPath of configPaths) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as { vaults?: Record<string, { path?: unknown }> }
      for (const vault of Object.values(raw.vaults ?? {})) {
        if (typeof vault.path !== 'string' || !vault.path) continue
        try {
          const root = assertVaultRoot(vault.path)
          if (root === managedRoot) continue
          candidates.set(root, {
            path: root,
            displayName: basename(root) || 'Vault',
            isObsidianVault: existsSync(join(root, '.obsidian')),
            isPromaManaged: false,
          })
        } catch {
          // A stale Obsidian registry entry is only a suggestion and can be ignored.
        }
      }
    } catch {
      // Obsidian is optional and its registry should never block the Vault page.
    }
  }
  return [...candidates.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
}
