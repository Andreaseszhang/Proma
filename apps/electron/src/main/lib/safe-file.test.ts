import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeTextFileAtomic } from './safe-file'

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('writeTextFileAtomic', () => {
  test('Given a malicious predictable tmp symlink When replacing text Then the symlink target is untouched', () => {
    const root = mkdtempSync(join(tmpdir(), 'proma-safe-file-'))
    roots.push(root)
    const target = join(root, 'note.md')
    const victim = join(root, 'victim.txt')
    writeFileSync(target, 'before', 'utf-8')
    writeFileSync(victim, 'secret', 'utf-8')
    symlinkSync(victim, `${target}.tmp`)

    writeTextFileAtomic(target, 'after')

    expect(readFileSync(target, 'utf-8')).toBe('after')
    expect(readFileSync(victim, 'utf-8')).toBe('secret')
  })
})
