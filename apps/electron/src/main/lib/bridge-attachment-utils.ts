/**
 * Bridge 附件处理工具函数
 *
 * 为微信、钉钉、飞书等 Bridge 提供图片/文件的保存、类型推断、
 * 以及 <attached_files> XML 构建能力。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAgentSessionWorkspacePath } from './config-paths'

/** 图片大小警告阈值 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/**
 * 通过 magic bytes 推断图片 MIME 类型
 */
export function inferImageMediaType(buffer: Buffer): string {
  if (buffer.length < 4) return 'image/jpeg'

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg'
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif'
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp'
  }

  return 'image/jpeg'
}

/**
 * MIME 类型 → 文件扩展名
 */
export function inferExtension(mediaType: string): string {
  const sub = mediaType.split('/')[1]
  if (sub === 'jpeg') return 'jpg'
  return sub || 'jpg'
}

/**
 * 保存图片到 Agent session 工作目录
 *
 * @returns 图片文件的绝对路径
 */
export function saveImageToSession(
  workspaceSlug: string,
  sessionId: string,
  fileNameHint: string,
  mediaType: string,
  data: Buffer,
): string {
  const sessionDir = getAgentSessionWorkspacePath(workspaceSlug, sessionId)
  const ext = inferExtension(mediaType)
  const filename = `${fileNameHint}.${ext}`
  const targetPath = join(sessionDir, filename)

  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(targetPath, data)
  console.log(`[Bridge 附件] 图片已保存: ${targetPath} (${data.length} bytes)`)

  return targetPath
}

/**
 * 保存文件到 Agent session 工作目录
 *
 * @returns 文件的绝对路径
 */
export function saveFileToSession(
  workspaceSlug: string,
  sessionId: string,
  fileName: string,
  data: Buffer,
): string {
  const sessionDir = getAgentSessionWorkspacePath(workspaceSlug, sessionId)
  const targetPath = join(sessionDir, fileName)

  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(targetPath, data)
  console.log(`[Bridge 附件] 文件已保存: ${targetPath} (${data.length} bytes)`)

  return targetPath
}

/**
 * 构建 <attached_files> XML 块
 *
 * 返回空字符串表示无附件。
 */
export function buildAttachedFilesBlock(refs: Array<{ label: string; path: string }>): string {
  if (refs.length === 0) return ''
  const lines = refs.map(r => `- ${r.label}: ${r.path}`)
  return `<attached_files>\n${lines.join('\n')}\n</attached_files>\n\n`
}
