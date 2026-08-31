import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isSafeMarkdownRelativeMediaSource,
  resolveMarkdownRelativeMediaPath,
} from './markdown-media-service'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function createFixture(): { root: string; markdownPath: string; imagePath: string; outsidePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'proma-markdown-media-'))
  tempDirectories.push(root)
  const docs = join(root, 'docs')
  const assets = join(docs, 'assets')
  mkdirSync(assets, { recursive: true })
  const markdownPath = join(docs, 'guide.md')
  const imagePath = join(assets, 'shot.png')
  const outsidePath = join(root, 'outside.png')
  writeFileSync(markdownPath, '# guide')
  writeFileSync(imagePath, 'image')
  writeFileSync(outsidePath, 'outside')
  return { root, markdownPath, imagePath, outsidePath }
}

describe('Markdown relative media authorization', () => {
  test('accepts ordinary nested relative paths', () => {
    expect(isSafeMarkdownRelativeMediaSource('./assets/shot.png')).toBeTrue()
    expect(isSafeMarkdownRelativeMediaSource('assets/My%20Shot.png?width=640#preview')).toBeTrue()
  })

  test('rejects absolute paths, protocols, UNC paths and traversal including encoded traversal', () => {
    for (const source of [
      '../outside.png',
      '%2e%2e/outside.png',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      '\\\\server\\share\\shot.png',
      'file:///etc/passwd',
      'https://example.com/shot.png',
      'data:image/png;base64,abc',
    ]) {
      expect(isSafeMarkdownRelativeMediaSource(source)).toBeFalse()
    }
  })

  test('resolves only a real file below the displayed Markdown directory', () => {
    const { markdownPath, imagePath } = createFixture()
    expect(resolveMarkdownRelativeMediaPath(markdownPath, './assets/shot.png')).toBe(realpathSync(imagePath))
  })

  test('resolves a relative Markdown file from an authorized preview root before resolving its image', () => {
    const { markdownPath, imagePath, root } = createFixture()
    const relativeMarkdownPath = markdownPath.slice(root.length + 1)
    expect(resolveMarkdownRelativeMediaPath(relativeMarkdownPath, './assets/shot.png', {
      candidateBasePaths: [root],
    })).toBe(realpathSync(imagePath))
  })

  test('rejects traversal and symlinks escaping the Markdown directory', () => {
    const { markdownPath, outsidePath, root } = createFixture()
    const linkedImagePath = join(root, 'docs', 'assets', 'outside-link.png')
    symlinkSync(outsidePath, linkedImagePath)

    expect(resolveMarkdownRelativeMediaPath(markdownPath, '../outside.png')).toBeNull()
    expect(resolveMarkdownRelativeMediaPath(markdownPath, 'assets/outside-link.png')).toBeNull()
  })
})
