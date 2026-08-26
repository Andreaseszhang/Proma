import { resolve } from 'node:path'
import { normalizePathForCompare } from '@proma/shared'

export interface VaultRuntimeAccessContext {
  rootPath: string
  allowAgentWrites: boolean
}

function normalizeRuntimeDirectoryPath(directory: string): string {
  const normalized = normalizePathForCompare(resolve(directory))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Vault 目录是对 Pi runtime 的实际文件访问授权，不能仅靠 prompt 声明为只读。
 * 未开启 allowAgentWrites 时，即使该路径从其它附加目录来源混入，也必须在 runtime
 * 参数、Browser 可访问根以及 attached_directories prompt 前剔除。
 */
export function resolveRuntimeAdditionalDirectories(
  directories: string[],
  vaultContext: VaultRuntimeAccessContext | null | undefined,
): string[] {
  if (!vaultContext) return directories
  const vaultRoot = vaultContext.rootPath.trim()
  if (!vaultRoot) return directories

  const normalizedVaultRoot = normalizeRuntimeDirectoryPath(vaultRoot)
  const withoutVaultRoot = directories.filter(
    (directory) => normalizeRuntimeDirectoryPath(directory) !== normalizedVaultRoot,
  )

  // additionalDirectories 对 Pi 是完整的文件授权；只有用户显式授权写入时才添加 Vault 根。
  return vaultContext.allowAgentWrites
    ? [...withoutVaultRoot, vaultRoot]
    : withoutVaultRoot
}
