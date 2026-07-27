import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'
import type { AgentProviderAdapter } from '@proma/shared'

type AgentOrchestratorModule = typeof import('./agent-orchestrator')
type AgentSessionManager = typeof import('./agent-session-manager')

let AgentOrchestrator: AgentOrchestratorModule['AgentOrchestrator']
let AgentEventBus: typeof import('./agent-event-bus').AgentEventBus
let sessionManager: AgentSessionManager
let tempHome: string
const originalHome = process.env.HOME
const originalPromaDev = process.env.PROMA_DEV
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

mock.module('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => join(process.env.HOME ?? tempHome, 'Library', 'Application Support'),
  },
  BrowserWindow: class {},
  clipboard: {},
  dialog: {},
  nativeImage: { createFromPath: () => ({}) },
  nativeTheme: {},
  powerMonitor: {},
  powerSaveBlocker: {},
  screen: {},
  shell: {},
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
}))

mock.module('node:os', () => ({
  ...os,
  homedir: () => tempHome,
}))

// 运行前保护在这些依赖初始化之前返回；替换它们可避免测试时加载
// automation scheduler -> agent-service -> agent-orchestrator 的生产循环依赖。
mock.module('./adapters/pi-builtin-tools', () => ({
  buildPiBuiltinTools: async () => ({ tools: [], collaborationAvailable: false }),
}))
mock.module('./builtin-mcp/registry', () => ({
  injectBuiltinMcpServers: async () => ({ collaborationAvailable: false }),
}))

beforeAll(async () => {
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-agent-orchestrator-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  delete process.env.CLAUDE_CONFIG_DIR

  ;({ AgentOrchestrator } = await import('./agent-orchestrator'))
  ;({ AgentEventBus } = await import('./agent-event-bus'))
  sessionManager = await import('./agent-session-manager')
})

beforeEach(() => {
  rmSync(join(tempHome, '.proma'), { recursive: true, force: true })
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
})

afterAll(() => {
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }
  if (originalPromaDev === undefined) {
    delete process.env.PROMA_DEV
  } else {
    process.env.PROMA_DEV = originalPromaDev
  }
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }
  rmSync(tempHome, { recursive: true, force: true })
})

function writeWorkspace(id: string, projectRootPath: string): void {
  writeFileSync(join(tempHome, '.proma', 'agent-workspaces.json'), JSON.stringify({
    version: 2,
    workspaces: [{
      id,
      name: 'Local Project',
      slug: 'local-project',
      projectRootPath,
      createdAt: 1,
      updatedAt: 1,
    }],
  }), 'utf-8')
}

function createOrchestrator(): { orchestrator: InstanceType<AgentOrchestratorModule['AgentOrchestrator']>; getQueryCalls: () => number } {
  let queryCalls = 0
  const adapter = {
    query: () => {
      queryCalls++
      return (async function* (): AsyncGenerator<never> {})()
    },
    abort: () => {},
    dispose: () => {},
  } as unknown as AgentProviderAdapter

  return {
    orchestrator: new AgentOrchestrator(adapter, new AgentEventBus()),
    getQueryCalls: () => queryCalls,
  }
}

async function sendFromUnavailableLocalProject(projectRootPath: string): Promise<{ errors: string[]; queryCalls: number }> {
  const workspaceId = 'local-workspace'
  writeWorkspace(workspaceId, projectRootPath)
  const session = sessionManager.createAgentSession('Local project session', undefined, workspaceId, undefined, 'pi')
  const { orchestrator, getQueryCalls } = createOrchestrator()
  const errors: string[] = []

  await orchestrator.sendMessage({
    sessionId: session.id,
    userMessage: 'run without recreating the project root',
    channelId: 'unused-channel',
    workspaceId,
    agentRuntime: 'pi',
  }, {
    onError: (error) => errors.push(error),
    onComplete: () => {},
    onTitleUpdated: () => {},
  })

  return { errors, queryCalls: getQueryCalls() }
}

describe('Agent 本地项目根运行前保护', () => {
  test('Given 本地项目记录仍存在但根目录被删除 When 发送消息 Then 在 SDK/Adapter 启动前阻断且不重建目录', async () => {
    const missingProjectRoot = join(tempHome, 'deleted-local-project')

    const result = await sendFromUnavailableLocalProject(missingProjectRoot)

    expect(result.errors).toEqual([
      `本地项目根目录不可用: 本地项目根目录不存在或无法访问：${missingProjectRoot}。请在 Proma 中重新选择项目文件夹。`,
    ])
    expect(result.queryCalls).toBe(0)
    expect(existsSync(missingProjectRoot)).toBe(false)
  })

  test('Given 本地项目根路径是文件 When 发送消息 Then 在 SDK/Adapter 启动前阻断', async () => {
    const projectRootFile = join(tempHome, 'local-project-file')
    writeFileSync(projectRootFile, 'not a directory', 'utf-8')

    const result = await sendFromUnavailableLocalProject(projectRootFile)

    expect(result.errors[0]).toContain('本地项目根目录不存在或无法访问')
    expect(result.errors[0]).toContain(projectRootFile)
    expect(result.queryCalls).toBe(0)
  })
})
