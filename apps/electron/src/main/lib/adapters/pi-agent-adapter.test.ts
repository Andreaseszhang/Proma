import { describe, expect, test } from 'bun:test'
import type { SDKMessage } from '@proma/shared'
import { shouldMarkCompactionAfterCompletedTurn } from './pi-agent-adapter'

function resultMessage(subtype: 'success' | 'error_during_execution'): SDKMessage {
  return { type: 'result', subtype } as SDKMessage
}

describe('压缩完成态判定', () => {
  test('given 主任务成功结束且无需续跑 when 压缩开始 then 标记为可验收完成', () => {
    expect(shouldMarkCompactionAfterCompletedTurn(resultMessage('success'), false)).toBe(true)
  })

  test('given CompactContext 触发原任务续跑 when 内部 agent_end 成功 then 保持运行态', () => {
    expect(shouldMarkCompactionAfterCompletedTurn(resultMessage('success'), true)).toBe(false)
  })

  test('given 主任务异常结束 when 压缩开始 then 保持运行态', () => {
    expect(shouldMarkCompactionAfterCompletedTurn(resultMessage('error_during_execution'), false)).toBe(false)
  })
})
