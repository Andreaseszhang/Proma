export type VaultSourceType = 'agent-history' | 'skill' | 'mcp' | 'project-file'

export interface VaultConfig {
  rootPath: string
  displayName: string
  inboxPath: string
  allowAgentWrites: boolean
  configuredAt: number
}

/** Renderer-safe summary. The selected root path stays in the main process. */
export interface VaultSummary {
  displayName: string
  inboxPath: string
  allowAgentWrites: boolean
  configuredAt: number
}

export interface VaultCandidate {
  path: string
  displayName: string
  isObsidianVault: boolean
}

export interface VaultFileEntry {
  relativePath: string
  name: string
  size: number
  modifiedAt: number
}

export interface VaultRenameInput {
  relativePath: string
  name: string
  expectedSha256?: string
}

export interface VaultReadResult {
  relativePath: string
  content: string
  sha256: string
  modifiedAt: number
}

export interface VaultWriteInput {
  relativePath: string
  content: string
  expectedSha256?: string
  createOnly?: boolean
}

export type VaultWriteResult =
  | { ok: true; relativePath: string; sha256: string; modifiedAt: number }
  | { ok: false; reason: 'conflict'; currentSha256: string; currentModifiedAt: number }

export interface VaultSearchResult {
  relativePath: string
  title: string
  snippet: string
  line: number
  modifiedAt: number
}

export interface VaultSourceSnapshot {
  type: VaultSourceType
  label: string
  content: string
  sourceUri: string
  capturedAt: number
}

export const VAULT_IPC_CHANNELS = {
  GET_CONFIG: 'vault:get-config',
  DISCOVER: 'vault:discover',
  SELECT: 'vault:select',
  AUTHORIZE_CANDIDATE: 'vault:authorize-candidate',
  UPDATE_CONFIG: 'vault:update-config',
  CLEAR: 'vault:clear',
  LIST_FILES: 'vault:list-files',
  READ_FILE: 'vault:read-file',
  WRITE_FILE: 'vault:write-file',
  CREATE_FILE: 'vault:create-file',
  RENAME_FILE: 'vault:rename-file',
  SEARCH: 'vault:search',
  APPEND_SOURCE: 'vault:append-source',
  SET_USER_CONTEXT: 'vault:set-user-context',
} as const
