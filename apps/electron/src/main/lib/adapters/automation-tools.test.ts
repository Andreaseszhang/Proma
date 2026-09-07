import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test.each([
  'automation-tools.fixture.ts',
  'automation-scheduling.fixture.ts',
])('Given %s 的隔离 mocks When 运行跨工作区回归 Then 使用独立进程', (name) => {
  const fixture = fileURLToPath(new URL(`./${name}`, import.meta.url))
  const result = Bun.spawnSync([process.execPath, 'test', fixture], { stdout: 'pipe', stderr: 'pipe' })
  const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr)
  // 验证实际执行了测试，不绑定 fixture 的通过数量。
  expect(output).toMatch(/\b[1-9]\d* pass\b/)
  expect(output).toContain('0 fail')
  expect(result.exitCode).toBe(0)
}, 30_000)
