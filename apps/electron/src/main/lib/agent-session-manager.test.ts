import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { join, win32 } from 'node:path'

type AgentSessionManager = typeof import('./agent-session-manager')
type AgentWorkspaceManager = typeof import('./agent-workspace-manager')
type ConfigPathsModule = typeof import('./config-paths')

let manager: AgentSessionManager
let workspaceManager: AgentWorkspaceManager
let configPaths: ConfigPathsModule
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

function jsonl(rows: string[]): string {
  return rows.join('\n') + '\n'
}

function writeAgentSessionJsonl(sessionId: string, rows: string[]): void {
  const dir = join(tempHome, '.proma', 'agent-sessions')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.jsonl`), jsonl(rows), 'utf-8')
}

function writeSdkSessionJsonl(sdkSessionId: string, rows: string[]): void {
  const dir = join(tempHome, '.proma', 'sdk-config', 'projects', 'test-project')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sdkSessionId}.jsonl`), jsonl(rows), 'utf-8')
}

function writeSdkFileHistoryBackup(sdkSessionId: string, backupFileName: string, content: string): void {
  const dir = join(tempHome, '.proma', 'sdk-config', 'file-history', sdkSessionId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, backupFileName), content, 'utf-8')
}

function writeAgentSessionsIndex(sessions: Array<{
  id: string
  title: string
  workspaceId: string
  createdAt: number
  updatedAt: number
}>): void {
  const dir = join(tempHome, '.proma')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent-sessions.json'), JSON.stringify({ version: 1, sessions }), 'utf-8')
}

function createIndexedSessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index}`,
    title: `会话 ${index}`,
    workspaceId: 'workspace-a',
    createdAt: index,
    updatedAt: index,
  }))
}

beforeAll(async () => {
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-agent-session-manager-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  delete process.env.CLAUDE_CONFIG_DIR
  configPaths = await import('./config-paths')
  workspaceManager = await import('./agent-workspace-manager')
  manager = await import('./agent-session-manager')
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

describe('Agent 会话 JSONL 读取', () => {
  test('Given 会话 JSONL 混入损坏行 When 读取 SDKMessage Then 跳过坏行并保留其它消息', () => {
    writeAgentSessionJsonl('session-with-bad-line', [
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '你好' }] }, parent_tool_use_id: null }),
      '{ 这不是合法 JSON',
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '仍然可读' }] }, parent_tool_use_id: null }),
    ])

    const messages = manager.getAgentSessionSDKMessages('session-with-bad-line')

    expect(messages.map((message) => message.type)).toEqual(['user', 'assistant'])
  })

  test('Given SDK rewind JSONL 存在损坏行 When 从快照恢复文件 Then 严格失败避免误报成功', () => {
    const cwd = join(tempHome, 'workspace')
    mkdirSync(cwd, { recursive: true })
    writeSdkSessionJsonl('sdk-session-with-bad-line', [
      JSON.stringify({ type: 'user', uuid: 'user-1', message: { content: [{ type: 'text', text: '修改文件' }] } }),
      '{ 这不是合法 JSON',
      JSON.stringify({
        type: 'file-history-snapshot',
        isSnapshotUpdate: false,
        snapshot: {
          messageId: 'user-1',
          trackedFileBackups: {
            'a.txt': { backupFileName: null },
          },
        },
      }),
    ])

    const result = manager.rewindFilesFromSnapshot('sdk-session-with-bad-line', 'user-1', cwd)

    expect(result.canRewind).toBe(false)
    expect(result.error).toContain('JSONL 第 2 行解析失败')
  })

  test('Given 会话 JSONL 存在损坏行 When 截断 SDKMessage Then 抛错避免重写不完整历史', () => {
    writeAgentSessionJsonl('session-truncate-bad-line', [
      JSON.stringify({ type: 'assistant', uuid: 'assistant-1', message: { content: [{ type: 'text', text: '完成' }] } }),
      '{ 这不是合法 JSON',
    ])

    expect(() => manager.truncateSDKMessages('session-truncate-bad-line', 'assistant-1'))
      .toThrow('JSONL 第 2 行解析失败')
  })
})

describe('Agent checkpoint 路径边界', () => {
  test('Given POSIX 快照包含 cwd 相对路径和附加目录绝对路径 When 从快照恢复 Then 只恢复允许目录内文件并拒绝越界路径', () => {
    const sdkSessionId = 'sdk-rewind-posix-path-boundaries'
    const cwd = join(tempHome, 'rewind-project')
    const attached = join(tempHome, 'rewind-attached')
    const attachedPrefix = join(tempHome, 'rewind-attached-escape')
    const outside = join(tempHome, 'rewind-outside')
    mkdirSync(cwd, { recursive: true })
    mkdirSync(attached, { recursive: true })
    mkdirSync(attachedPrefix, { recursive: true })
    mkdirSync(outside, { recursive: true })

    writeFileSync(join(cwd, 'src.txt'), 'current cwd', 'utf-8')
    writeFileSync(join(cwd, 'unsafe.txt'), 'current unsafe', 'utf-8')
    writeFileSync(join(attached, 'notes.txt'), 'current attached', 'utf-8')
    writeFileSync(join(attachedPrefix, 'notes.txt'), 'current prefix', 'utf-8')
    writeFileSync(join(outside, 'notes.txt'), 'current outside', 'utf-8')

    writeSdkFileHistoryBackup(sdkSessionId, 'cwd-backup', 'rewound cwd')
    writeSdkFileHistoryBackup(sdkSessionId, 'attached-backup', 'rewound attached')
    writeSdkFileHistoryBackup(sdkSessionId, 'prefix-backup', 'must stay prefix')
    writeSdkFileHistoryBackup(sdkSessionId, 'outside-backup', 'must stay outside')
    const escapedBackupPath = join(tempHome, '.proma', 'sdk-config', 'file-history', 'escaped-backup')
    mkdirSync(join(tempHome, '.proma', 'sdk-config', 'file-history'), { recursive: true })
    writeFileSync(escapedBackupPath, 'must stay unsafe', 'utf-8')

    writeSdkSessionJsonl(sdkSessionId, [
      JSON.stringify({ type: 'user', uuid: 'rewind-user-1' }),
      JSON.stringify({
        type: 'file-history-snapshot',
        isSnapshotUpdate: false,
        snapshot: {
          messageId: 'rewind-user-1',
          trackedFileBackups: {
            'src.txt': { backupFileName: 'cwd-backup' },
            [join(attached, 'notes.txt')]: { backupFileName: 'attached-backup' },
            [join(attachedPrefix, 'notes.txt')]: { backupFileName: 'prefix-backup' },
            '../rewind-outside/notes.txt': { backupFileName: 'outside-backup' },
            'unsafe.txt': { backupFileName: '../escaped-backup' },
          },
        },
      }),
    ])

    const result = manager.rewindFilesFromSnapshot(sdkSessionId, 'rewind-user-1', cwd, undefined, undefined, [attached])

    expect(result).toMatchObject({
      canRewind: true,
      filesChanged: ['src.txt', join(attached, 'notes.txt')],
    })
    expect(readFileSync(join(cwd, 'src.txt'), 'utf-8')).toBe('rewound cwd')
    expect(readFileSync(join(attached, 'notes.txt'), 'utf-8')).toBe('rewound attached')
    expect(readFileSync(join(attachedPrefix, 'notes.txt'), 'utf-8')).toBe('current prefix')
    expect(readFileSync(join(outside, 'notes.txt'), 'utf-8')).toBe('current outside')
    expect(readFileSync(join(cwd, 'unsafe.txt'), 'utf-8')).toBe('current unsafe')
  })

  test('Given Windows 路径 When 使用 path.win32 解析快照路径 Then 正确支持反斜杠、附加盘符并拒绝越界', () => {
    const cwd = 'C:\\work\\project'
    const attached = 'D:\\shared'
    const fileHistoryDir = 'C:\\sdk\\file-history\\session'

    expect(manager.resolveSafeRewindPath('src\\index.ts', cwd, [], win32))
      .toBe('C:\\work\\project\\src\\index.ts')
    expect(manager.resolveSafeRewindPath('D:\\shared\\notes.txt', cwd, [attached], win32))
      .toBe('D:\\shared\\notes.txt')
    expect(manager.resolveSafeRewindPath('D:\\shared-escape\\notes.txt', cwd, [attached], win32))
      .toBeUndefined()
    expect(manager.resolveSafeRewindPath('..\\outside.txt', cwd, [], win32))
      .toBeUndefined()
    expect(manager.resolveSafeRewindPath('E:\\other-drive.txt', cwd, [attached], win32))
      .toBeUndefined()

    expect(manager.resolveSafeRewindPath('nested\\backup', fileHistoryDir, [], win32))
      .toBe('C:\\sdk\\file-history\\session\\nested\\backup')
    expect(manager.resolveSafeRewindPath('C:\\sdk\\file-history\\session-escape\\backup', fileHistoryDir, [], win32))
      .toBeUndefined()
    expect(manager.resolveSafeRewindPath('..\\escaped-backup', fileHistoryDir, [], win32))
      .toBeUndefined()
  })
})

describe('Agent 会话 runtime 元数据', () => {
  test('Given 已保存 OpenAI medium 默认值 When 新建 Pi 或 Claude 会话 Then 默认并持久化 medium', () => {
    const settingsPath = join(tempHome, '.proma', 'settings.json')
    mkdirSync(join(tempHome, '.proma'), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify({
      agentThinking: { type: 'adaptive' },
      agentEffort: 'max',
      defaultOpenAIThinkingLevel: 'medium',
    }), 'utf-8')

    try {
      const defaultRuntimeSession = manager.createAgentSession('默认内核会话')
      const claudeRuntimeSession = manager.createAgentSession('Claude 内核会话', undefined, undefined, undefined, 'claude')

      expect(defaultRuntimeSession.agentRuntime).toBe('pi')
      expect(claudeRuntimeSession.agentRuntime).toBe('claude')
      expect(manager.getAgentSessionMeta(defaultRuntimeSession.id)?.agentRuntime).toBe('pi')
      expect(manager.getAgentSessionMeta(claudeRuntimeSession.id)?.agentRuntime).toBe('claude')
      expect(defaultRuntimeSession.reasoningLevel).toBe('medium')
      expect(claudeRuntimeSession.reasoningLevel).toBe('medium')
      expect(manager.getAgentSessionMeta(defaultRuntimeSession.id)?.reasoningLevel).toBe('medium')
      expect(manager.getAgentSessionMeta(claudeRuntimeSession.id)?.reasoningLevel).toBe('medium')
    } finally {
      rmSync(settingsPath, { force: true })
    }
  })

  test('Given 新安装用户保存关闭思考 When 连续新建会话 Then 不被旧版迁移改回 high', () => {
    const settingsPath = join(tempHome, '.proma', 'settings.json')
    const indexPath = join(tempHome, '.proma', 'agent-sessions.json')
    const indexBackupPath = `${indexPath}.bak`
    mkdirSync(join(tempHome, '.proma'), { recursive: true })
    rmSync(indexPath, { force: true })
    rmSync(indexBackupPath, { force: true })
    writeFileSync(settingsPath, JSON.stringify({
      agentThinking: { type: 'adaptive' },
      agentEffort: 'medium',
      defaultOpenAIThinkingLevel: 'off',
    }), 'utf-8')

    try {
      const firstSession = manager.createAgentSession('关闭思考会话一')
      const secondSession = manager.createAgentSession('关闭思考会话二')

      expect(manager.getAgentSessionMeta(firstSession.id)?.reasoningLevel).toBe('off')
      expect(manager.getAgentSessionMeta(secondSession.id)?.reasoningLevel).toBe('off')
    } finally {
      rmSync(settingsPath, { force: true })
      rmSync(indexPath, { force: true })
      rmSync(indexBackupPath, { force: true })
    }
  })

  test('Given session settings When updating Then persists reasoning depth per session', () => {
    const session = manager.createAgentSession('Codex 会话', undefined, undefined, undefined, 'pi')

    const updated = manager.updateAgentSessionMeta(session.id, { reasoningLevel: 'xhigh' })

    expect(updated.reasoningLevel).toBe('xhigh')
    expect(manager.getAgentSessionMeta(session.id)).toMatchObject({ reasoningLevel: 'xhigh' })
  })

  test('Given a session When star state is updated Then it persists without changing freshness or archive state', () => {
    const session = manager.createAgentSession('星标会话')
    const archived = manager.updateAgentSessionMeta(session.id, { archived: true })

    const updated = manager.updateAgentSessionMeta(session.id, { starred: true })

    expect(updated).toMatchObject({ starred: true, archived: true })
    expect(updated.updatedAt).toBe(archived.updatedAt)
    expect(manager.getAgentSessionMeta(session.id)).toMatchObject({ starred: true, archived: true })
  })
})

describe('Agent fork cwd 与 sidecar 工作台规划', () => {
  test('Given 本地项目的 Claude/Pi 会话 When 规划 fork 目录 Then 两端 Agent cwd 都使用同一个项目根且 sidecar 仍按会话隔离', () => {
    const localProjectRoot = mkdtempSync(join(tempHome, 'fork-local-project-'))
    const workspace = workspaceManager.createAgentWorkspace({
      name: 'Fork Local Project',
      projectRootPath: localProjectRoot,
    })
    const sourceSession = manager.createAgentSession('本地 fork 源会话', undefined, workspace.id, undefined, 'claude')
    const destSession = manager.createAgentSession('本地 fork 目标会话', undefined, workspace.id, undefined, 'pi')
    const sourceSessionId = sourceSession.id
    const destSessionId = destSession.id

    const sourceCwd = manager.resolveAgentCwd(workspace, sourceSessionId)
    const destCwd = manager.resolveAgentCwd(workspace, destSessionId)
    const sourceWorkbenchDir = manager.resolveAgentWorkbenchDir(workspace, sourceSessionId)
    const destWorkbenchDir = manager.resolveAgentWorkbenchDir(workspace, destSessionId)

    expect(sourceCwd).toBe(workspace.projectRootPath)
    expect(destCwd).toBe(workspace.projectRootPath)
    expect(sourceWorkbenchDir).toBe(configPaths.getAgentSessionWorkspacePath(workspace.slug, sourceSessionId))
    expect(destWorkbenchDir).toBe(configPaths.getAgentSessionWorkspacePath(workspace.slug, destSessionId))
    expect(sourceWorkbenchDir).not.toBe(workspace.projectRootPath)
    expect(destWorkbenchDir).not.toBe(workspace.projectRootPath)
    expect(existsSync(join(sourceWorkbenchDir!, '.context'))).toBe(true)
    expect(existsSync(join(destWorkbenchDir!, '.context'))).toBe(true)
  })

  test('Given Proma 托管项目 When 规划 fork 目录 Then Agent cwd 与 sidecar 都按源和新会话分离', () => {
    const workspace = workspaceManager.createAgentWorkspace('Fork Managed Project')
    const sourceSessionId = 'managed-source-session'
    const destSessionId = 'managed-dest-session'

    const sourceCwd = manager.resolveAgentCwd(workspace, sourceSessionId)
    const destCwd = manager.resolveAgentCwd(workspace, destSessionId)
    const sourceWorkbenchDir = manager.resolveAgentWorkbenchDir(workspace, sourceSessionId)
    const destWorkbenchDir = manager.resolveAgentWorkbenchDir(workspace, destSessionId)
    const expectedSourceDir = configPaths.getAgentSessionWorkspacePath(workspace.slug, sourceSessionId)
    const expectedDestDir = configPaths.getAgentSessionWorkspacePath(workspace.slug, destSessionId)

    expect(sourceCwd).toBe(expectedSourceDir)
    expect(destCwd).toBe(expectedDestDir)
    expect(sourceWorkbenchDir).toBe(expectedSourceDir)
    expect(destWorkbenchDir).toBe(expectedDestDir)
    expect(sourceCwd).not.toBe(destCwd)
  })
})

describe('Agent 会话引用搜索', () => {
  test('Given 工作区有超过 20 个会话 When 请求最近 200 条 Then 按更新时间返回 200 条', () => {
    writeAgentSessionsIndex(createIndexedSessions(220))

    const results = manager.searchAgentSessionReferences({
      workspaceId: 'workspace-a',
      limit: 200,
    })

    expect(results).toHaveLength(200)
    expect(results[0]?.sessionId).toBe('session-219')
    expect(results.at(-1)?.sessionId).toBe('session-20')
    expect(results.every((result) => result.matchSource === 'recent')).toBe(true)
  })

  test('Given 请求数量超过性能上限 When 搜索可引用会话 Then 最多返回 200 条', () => {
    writeAgentSessionsIndex(createIndexedSessions(220))

    const results = manager.searchAgentSessionReferences({
      workspaceId: 'workspace-a',
      limit: 500,
    })

    expect(results).toHaveLength(200)
  })
})
