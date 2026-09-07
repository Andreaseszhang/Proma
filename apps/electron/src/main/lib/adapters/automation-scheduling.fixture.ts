import { afterAll, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSendInput, AgentWorkspace } from '@proma/shared'
import { resolveAutomationWorkspace } from './automation-workspace'

// 真实 manager + scheduler，隔离磁盘位置、Electron 与模型运行；不启动定时轮询。
const dir = mkdtempSync(join(tmpdir(), 'proma-automation-target-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
mock.module('../config-paths', () => ({ getAutomationsPath: () => join(dir, 'automations.json') }))
mock.module('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
let createdWorkspace: string | undefined
let headless: AgentSendInput | undefined
let createdCount = 0
mock.module('../agent-session-manager', () => ({
  createAgentSession: (_name: string, _channelId?: string, workspaceId?: string) => {
    createdWorkspace = workspaceId
    createdCount++
    return { id: 'run-b', workspaceId }
  },
  updateAgentSessionMeta: () => undefined,
  getAgentSessionMeta: () => ({ id: 'old-a', workspaceId: 'a' }),
}))
mock.module('../agent-session-usage', () => ({ getSessionContextUsageRatio: () => 0 }))
mock.module('../agent-service', () => ({
  isAgentSessionActive: () => false,
  runAgentHeadless: async (input: AgentSendInput, callbacks: { onComplete: () => void }) => {
    headless = input
    callbacks.onComplete()
  },
}))
mock.module('../automation-notification-service', () => ({ notifyAutomationRunFinished: async () => undefined }))
const manager = await import('../automation-manager')
const { runAutomation } = await import('../automation-scheduler')
const b: AgentWorkspace = { id: 'b', name: 'B', slug: 'b', createdAt: 1, updatedAt: 1 }

test('Given A 创建到 B When 持久化后调度 Then 新会话与 headless 均使用 B 并保留来源与模型', async () => {
  const target = resolveAutomationWorkspace('b', 'a', (id) => id === 'b' ? b : undefined)
  const automation = manager.createAutomation({
    name: '测试', prompt: '测试内容', scheduleType: 'daily', intervalMinutes: 10, timeOfDay: '09:00',
    workspaceId: target?.id, sourceSessionId: 'source-a', channelId: 'channel-a', modelId: 'model-a',
  })
  const disk = JSON.parse(readFileSync(join(dir, 'automations.json'), 'utf8'))
  expect(disk.automations[0]).toMatchObject({ workspaceId: 'b', sourceSessionId: 'source-a' })
  await runAutomation(automation, true)
  expect(createdWorkspace).toBe('b')
  expect(headless).toMatchObject({ sessionId: 'run-b', workspaceId: 'b', channelId: 'channel-a', modelId: 'model-a', triggeredBy: 'automation' })
  expect(headless).not.toHaveProperty('additionalDirectories')
  expect(manager.getAutomation(automation.id)?.runHistory[0]?.status).toBe('success')
})

test('Given B 任务的历史会话已位于 A When reuse 调度 Then 不复用 A 的会话', async () => {
  const automation = manager.createAutomation({
    name: '测试复用', prompt: '测试', scheduleType: 'daily', intervalMinutes: 10, timeOfDay: '09:00',
    workspaceId: 'b', channelId: 'channel-a', sessionMode: 'reuse',
  })
  manager.setLastSessionId(automation.id, 'old-a')
  const before = createdCount
  await runAutomation(manager.getAutomation(automation.id)!, true)
  expect(createdCount).toBe(before + 1)
  expect(createdWorkspace).toBe('b')
  expect(headless?.sessionId).toBe('run-b')
})
