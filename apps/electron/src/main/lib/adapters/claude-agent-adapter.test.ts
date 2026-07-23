import { describe, expect, test } from 'bun:test'
import { getClaudeSettingSourcesForWorkspace, resolveClaudeSettingSources } from './claude-agent-adapter'

describe('Claude SDK settings 来源', () => {
  test('Given 未指定来源 When 解析 Then 保持 Proma 托管项目的 user 与 project 行为', () => {
    expect(resolveClaudeSettingSources()).toEqual(['user', 'project'])
  })

  test('Given 本地项目仅授权 Proma 隔离 user 来源 When 解析 Then 不读取用户项目级配置', () => {
    expect(resolveClaudeSettingSources(['user'])).toEqual(['user'])
  })

  test('Given 本地项目根目录 When 选择 settings 来源 Then 排除 project 以隔离用户 Claude 配置', () => {
    expect(getClaudeSettingSourcesForWorkspace(true)).toEqual(['user'])
  })

  test('Given Proma 托管项目 When 选择 settings 来源 Then 保留 session 目录的 project 配置', () => {
    expect(getClaudeSettingSourcesForWorkspace(false)).toEqual(['user', 'project'])
  })
})
