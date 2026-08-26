import { describe, expect, test } from 'bun:test'
import { triggerLegacyScratchPadMigration } from './legacy-scratch-pad-migration'

describe('旧 Scratch Pad 迁移触发器', () => {
  test('Given 应用启动 When 挂载无 UI 触发器 Then 调用保留的加载 IPC 以执行迁移', async () => {
    let calls = 0

    triggerLegacyScratchPadMigration(() => {
      calls += 1
      return Promise.resolve(undefined)
    })

    await Promise.resolve()
    expect(calls).toBe(1)
  })
})
