import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'

type AgentWorkspaceManager = typeof import('./agent-workspace-manager')
type AgentPromptBuilder = typeof import('./agent-prompt-builder')
type ConfigPathsModule = typeof import('./config-paths')

let manager: AgentWorkspaceManager
let promptBuilder: AgentPromptBuilder
let configPaths: ConfigPathsModule
let tempHome: string
const originalHome = process.env.HOME
const originalPromaDev = process.env.PROMA_DEV

mock.module('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => join(process.env.HOME ?? tempHome, 'Library', 'Application Support'),
  },
}))

mock.module('node:os', () => ({
  ...os,
  homedir: () => tempHome,
}))

beforeAll(async () => {
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-agent-prompt-builder-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  configPaths = await import('./config-paths')
  manager = await import('./agent-workspace-manager')
  promptBuilder = await import('./agent-prompt-builder')
})

beforeEach(() => {
  rmSync(join(tempHome, '.proma'), { recursive: true, force: true })
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
})

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalPromaDev === undefined) delete process.env.PROMA_DEV
  else process.env.PROMA_DEV = originalPromaDev
  rmSync(tempHome, { recursive: true, force: true })
})

describe('项目根目录系统提示', () => {
  test('Given 本地项目 When 构建系统提示 Then 区分实际 cwd、会话工作台与两级 Context', () => {
    const projectRoot = mkdtempSync(join(tempHome, 'local-project-'))
    const workspace = manager.createAgentWorkspace({
      name: 'Local Prompt Project',
      projectRootPath: projectRoot,
    })
    const sessionId = 'session-for-local-project'
    const sessionDir = configPaths.getAgentSessionWorkspacePath(workspace.slug, sessionId)
    const normalizedProjectRoot = realpathSync(projectRoot)

    const prompt = promptBuilder.buildSystemPrompt({
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      sessionId,
      permissionMode: 'plan',
    })

    expect(prompt).toContain(`- 项目根目录: ${normalizedProjectRoot}`)
    expect(prompt).toContain(`- 会话工作台目录: ${sessionDir}`)
    expect(prompt).toContain(`- 实际工作目录（cwd）: ${normalizedProjectRoot}`)
    expect(prompt).toContain(`**会话级** \`${join(sessionDir, '.context')}\``)
    expect(prompt).toContain(`**工作区级** \`${join(normalizedProjectRoot, '.context')}\``)
    expect(prompt).toContain(`\`${join(sessionDir, '.context', 'plan')}/\``)
    expect(prompt).not.toContain('当前会话目录（cwd）')
  })
})
