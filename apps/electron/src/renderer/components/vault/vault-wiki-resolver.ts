import type { VaultFileEntry } from '@proma/shared'

export interface VaultWikiLinkResolver {
  resolve: (target: string) => string | null
}

function normalizeWikiTarget(target: string): string {
  const withoutAlias = target.split('|', 1)[0] ?? ''
  const withoutHeading = withoutAlias.split('#', 1)[0] ?? ''
  return withoutHeading.replace(/\\/g, '/').replace(/^\.\//, '').trim().replace(/\.md$/i, '').toLocaleLowerCase()
}

function addUnique(map: Map<string, string | null>, key: string, relativePath: string): void {
  const current = map.get(key)
  if (current === undefined) map.set(key, relativePath)
  else if (current !== relativePath) map.set(key, null)
}

/**
 * Builds path/title lookup tables once per file-list change.  `null` retains
 * Obsidian's safe behaviour for ambiguous note titles without scanning every
 * file for every rendered wikilink.
 */
export function createVaultWikiLinkResolver(files: readonly VaultFileEntry[]): VaultWikiLinkResolver {
  const paths = new Map<string, string | null>()
  const titles = new Map<string, string | null>()

  for (const file of files) {
    const relativePath = file.relativePath
    addUnique(paths, relativePath.replace(/\.md$/i, '').toLocaleLowerCase(), relativePath)
    addUnique(titles, file.name.replace(/\.md$/i, '').toLocaleLowerCase(), relativePath)
  }

  return {
    resolve: (target) => {
      const normalizedTarget = normalizeWikiTarget(target)
      if (!normalizedTarget) return null

      const path = paths.get(normalizedTarget)
      if (path !== undefined) return path
      return normalizedTarget.includes('/') ? null : titles.get(normalizedTarget) ?? null
    },
  }
}
