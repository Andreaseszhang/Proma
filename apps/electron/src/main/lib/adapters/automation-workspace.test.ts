import { describe, expect, test } from 'bun:test'
import type { AgentWorkspace } from '@proma/shared'
import { resolveAutomationWorkspace, summarizeAutomationWorkspace } from './automation-workspace'
import { automationCreateToolParameters } from './automation-tool-schema'

const workspaces: AgentWorkspace[] = [
  { id: 'a', name: '项目', slug: 'project-a', createdAt: 1, updatedAt: 1 },
  { id: 'b', name: '项目', slug: 'project-b', createdAt: 1, updatedAt: 1 },
]
const lookup = (id: string) => workspaces.find((workspace) => workspace.id === id)

describe('跨工作区创建目标', () => {
  test('Given A 会话 When 指定 B 的 ID Then 使用 B，重名不影响精确选择', () => {
    expect(resolveAutomationWorkspace('b', 'a', lookup)).toEqual(workspaces[1])
  })
  test('Given A 会话 When 省略目标 Then 保持 A', () => {
    expect(resolveAutomationWorkspace(undefined, 'a', lookup)).toEqual(workspaces[0])
  })
  test('Given 无工作区会话 When 省略目标 Then 保留无工作区草稿语义', () => {
    expect(resolveAutomationWorkspace(undefined, undefined, lookup)).toBeUndefined()
  })
  test('Given 无工作区会话 When 指定 B Then 仍可创建到 B', () => {
    expect(resolveAutomationWorkspace(' b ', undefined, lookup)?.id).toBe('b')
  })
  test.each(['missing', 'project-b', '/tmp/project', '项目'])('Given 无效目标 %s When 解析 Then 拒绝而不是回退 A', (target) => {
    expect(() => resolveAutomationWorkspace(target, 'a', lookup)).toThrow('不存在')
  })
  test.each(['', '   ', null, 123, {}, []].map((target) => [target]))('Given 非法目标 %j When 解析 Then 拒绝', (target) => {
    expect(() => resolveAutomationWorkspace(target, 'a', lookup)).toThrow('workspaceId')
  })
  test('Given 当前工作区已删除 When 默认创建 Then 拒绝失效归属', () => {
    expect(() => resolveAutomationWorkspace(undefined, 'deleted', lookup)).toThrow('不存在')
  })
  test('Given 工作区列表 When 摘要 Then 仅暴露选择元数据，不暴露配置或文件内容', () => {
    expect(summarizeAutomationWorkspace(workspaces[0]!, 'a')).toEqual({
      id: 'a', name: '项目', slug: 'project-a', isCurrent: true, projectRootStatus: 'managed',
    })
    expect(summarizeAutomationWorkspace({ ...workspaces[1]!, projectRootPath: '/private/project', projectRootStatus: 'missing' }, 'a')).toEqual({
      id: 'b', name: '项目', slug: 'project-b', isCurrent: false, projectRootStatus: 'missing',
    })
  })
  test('Given 创建工具 schema When 查看 workspaceId Then 公开字符串目标且非必填', () => {
    expect(automationCreateToolParameters.properties.workspaceId.type).toBe('string')
    expect(automationCreateToolParameters.required).not.toContain('workspaceId')
  })
})
