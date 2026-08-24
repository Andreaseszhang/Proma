import type { VaultFileEntry } from '@proma/shared'

export type VaultReferenceType = 'skill' | 'mcp' | 'session' | 'todo' | 'calendar_event'
export type VaultReferenceTrigger = '/' | '#' | '&' | '~' | '～' | '@' | '*'

export interface VaultReference {
  type: VaultReferenceType
  id: string
  label: string
}

export interface VaultReferenceRange extends VaultReference {
  from: number
  to: number
}

const REFERENCE_PREFIX = '<!--proma:reference:'
const REFERENCE_SUFFIX = '-->'

export function vaultReferenceTypeForTrigger(trigger?: VaultReferenceTrigger): VaultReferenceType | undefined {
  if (trigger === '/') return 'skill'
  if (trigger === '#') return 'mcp'
  if (trigger === '&') return 'session'
  if (trigger === '~' || trigger === '～') return 'todo'
  return undefined
}

function vaultReferenceTriggerForType(type: VaultReferenceType): '/' | '#' | '&' | '~' {
  if (type === 'skill') return '/'
  if (type === 'mcp') return '#'
  if (type === 'session') return '&'
  return '~'
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function isVaultReferenceType(value: unknown): value is VaultReferenceType {
  return value === 'skill' || value === 'mcp' || value === 'session' || value === 'todo' || value === 'calendar_event'
}

function normalizedReferenceLabel(label: string): string {
  return label.replace(/[\r\n<>]/g, ' ').trim() || '未命名引用'
}

/** Obsidian 外部查看时保留 Proma 的 canonical marker，Proma 内部用 metadata 恢复 chip。 */
export function serializeVaultReference(reference: VaultReference): string {
  const label = normalizedReferenceLabel(reference.label)
  const trigger = vaultReferenceTriggerForType(reference.type)
  const id = encodeURIComponent(reference.id)
  const encodedLabel = encodeURIComponent(label)
  const marker = reference.type === 'skill'
    ? `/skill:${id}`
    : reference.type === 'mcp'
      ? `#mcp:${id}`
      : `&${reference.type}:${id}::${encodedLabel}`
  const metadata = encodeURIComponent(JSON.stringify({ v: 1, type: reference.type, id: reference.id, label, trigger }))
  return `${marker}${REFERENCE_PREFIX}${metadata}${REFERENCE_SUFFIX}`
}

export function parseVaultReferences(content: string): VaultReferenceRange[] {
  const references: VaultReferenceRange[] = []
  const pattern = /(?:(?:\/skill:[^\s<]+|#mcp:[^\s<]+|[&~](?:session|todo|calendar_event):[^\s<]+(?:::[^\s<]+)?)|(?:Skill|MCP|会话|待办|日程)：[^\n<]*)<!--proma:reference:([^>]+)-->/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const encoded = match[1]
    if (!encoded) continue
    const decoded = safeDecode(encoded)
    if (!decoded) continue
    try {
      const value = JSON.parse(decoded) as { type?: unknown; id?: unknown; label?: unknown }
      if (!isVaultReferenceType(value.type) || typeof value.id !== 'string' || typeof value.label !== 'string') continue
      references.push({
        type: value.type,
        id: value.id,
        label: value.label,
        from: match.index,
        to: match.index + match[0].length,
      })
    } catch {
      // 外部编辑的 Markdown 不能因失效 metadata 阻塞正常编辑。
    }
  }

  return references
}

export function findVaultReferenceAt(content: string, position: number): VaultReferenceRange | null {
  return parseVaultReferences(content).find((reference) => position >= reference.from && position <= reference.to) ?? null
}

export interface VaultWikiLink {
  target: string
  from: number
  to: number
}

export function findVaultWikiLinkAt(content: string, position: number): VaultWikiLink | null {
  const pattern = /\[\[([^\]\n]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const target = match[1]?.trim()
    if (!target) continue
    const from = match.index
    const to = from + match[0].length
    if (position >= from && position <= to) return { target, from, to }
  }
  return null
}

function normalizeWikiTarget(target: string): string {
  const withoutAlias = target.split('|', 1)[0] ?? ''
  const withoutHeading = withoutAlias.split('#', 1)[0] ?? ''
  return withoutHeading.replace(/\\/g, '/').replace(/^\.\//, '').trim().replace(/\.md$/i, '').toLocaleLowerCase()
}

/** Resolve Obsidian's relative-path/title wikilink forms, returning null for missing or ambiguous notes. */
export function resolveVaultWikiLink(target: string, files: VaultFileEntry[]): string | null {
  const normalizedTarget = normalizeWikiTarget(target)
  if (!normalizedTarget) return null

  const pathMatches = files.filter((file) => (
    file.relativePath.replace(/\.md$/i, '').toLocaleLowerCase() === normalizedTarget
  ))
  if (pathMatches.length === 1) return pathMatches[0]?.relativePath ?? null
  if (pathMatches.length > 1 || normalizedTarget.includes('/')) return null

  const titleMatches = files.filter((file) => (
    file.name.replace(/\.md$/i, '').toLocaleLowerCase() === normalizedTarget
  ))
  return titleMatches.length === 1 ? (titleMatches[0]?.relativePath ?? null) : null
}
