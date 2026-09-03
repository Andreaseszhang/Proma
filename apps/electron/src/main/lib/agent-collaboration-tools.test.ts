import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

describe('Agent collaboration thinking level', () => {
  test('runs the collaboration integration fixture in an isolated Bun process', () => {
    const fixturePath = join(import.meta.dir, 'agent-collaboration-tools.fixture.ts')
    const result = spawnSync(process.execPath, ['test', fixturePath], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: process.env,
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
