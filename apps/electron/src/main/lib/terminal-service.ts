/**
 * 右侧面板终端进程管理。
 *
 * 使用 node-pty 创建真实 PTY，渲染端由 xterm.js 负责键盘输入和 ANSI 渲染。
 */

import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type {
  TerminalBusyResult,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalListResult,
  TerminalResizeInput,
  TerminalSession,
  TerminalStartInput,
} from '@proma/shared'
import { TERMINAL_IPC_CHANNELS } from '@proma/shared'
import { detectGitBash } from './git-bash-detector'

interface TerminalProcess {
  meta: TerminalSession
  ptyProcess: pty.IPty
  webContents: WebContents
  webContentsId: number
  outputBuffer: string
  pendingOutput: string
  flushTimer: ReturnType<typeof setTimeout> | null
  droppedOutputChars: number
  backpressureNoticeQueued: boolean
}

interface ShellCommand {
  shell: string
  args: string[]
}

const terminals = new Map<string, TerminalProcess>()
const terminalIdsByWebContents = new Map<number, Set<string>>()
const activeSessionByWebContents = new Map<number, string>()
const watchedWebContentsIds = new Set<number>()
const MAX_TERMINALS_PER_SESSION = 4
const MAX_TERMINALS_TOTAL = 16
const ACTIVE_TERMINAL_FLUSH_MS = 33
const BACKGROUND_TERMINAL_FLUSH_MS = 250
const MAX_PENDING_OUTPUT_CHARS = 200_000
const MAX_OUTPUT_BUFFER_CHARS = 500_000
const TERMINAL_BACKPRESSURE_NOTICE = '\r\n[Proma: 终端输出过快，已丢弃部分输出以保持应用响应]\r\n'

function createTerminalId(): string {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function resolveShellCommand(): Promise<ShellCommand> {
  if (process.platform === 'darwin') {
    return { shell: '/bin/zsh', args: ['-l'] }
  }

  if (process.platform === 'win32') {
    const gitBash = await detectGitBash()
    if (gitBash.available && gitBash.path) {
      return { shell: gitBash.path, args: ['--login'] }
    }
    throw new Error(gitBash.error ?? '未找到可用的 Bash，请先安装 Git for Windows')
  }

  return { shell: process.env.SHELL || '/bin/bash', args: ['-l'] }
}

function buildTerminalEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    PROMA_TERMINAL: '1',
  }
}

function clampSize(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value as number)))
}

function trackTerminalForWebContents(terminalId: string, webContents: WebContents): number {
  const webContentsId = webContents.id
  const terminalIds = terminalIdsByWebContents.get(webContentsId) ?? new Set<string>()
  terminalIds.add(terminalId)
  terminalIdsByWebContents.set(webContentsId, terminalIds)

  if (!watchedWebContentsIds.has(webContentsId)) {
    watchedWebContentsIds.add(webContentsId)
    webContents.once('destroyed', () => {
      stopTerminalsForWebContents(webContentsId)
      terminalIdsByWebContents.delete(webContentsId)
      watchedWebContentsIds.delete(webContentsId)
    })
  }

  return webContentsId
}

function untrackTerminal(terminalId: string, webContentsId: number): void {
  const terminalIds = terminalIdsByWebContents.get(webContentsId)
  if (!terminalIds) return
  terminalIds.delete(terminalId)
  if (terminalIds.size === 0) {
    terminalIdsByWebContents.delete(webContentsId)
    activeSessionByWebContents.delete(webContentsId)
  }
}

function removeTerminal(terminalId: string): TerminalProcess | null {
  const terminal = terminals.get(terminalId)
  if (!terminal) return null
  if (terminal.flushTimer) {
    clearTimeout(terminal.flushTimer)
    terminal.flushTimer = null
  }
  terminals.delete(terminalId)
  untrackTerminal(terminalId, terminal.webContentsId)
  return terminal
}

function getOwnedTerminal(terminalId: string, webContentsId: number): TerminalProcess | null {
  const terminal = terminals.get(terminalId)
  if (!terminal) return null
  if (terminal.webContentsId !== webContentsId) {
    console.warn(`[TerminalService] 拒绝跨窗口操作终端: terminal=${terminalId}, owner=${terminal.webContentsId}, requester=${webContentsId}`)
    return null
  }
  return terminal
}

function appendOutputBuffer(terminal: TerminalProcess, data: string): void {
  const next = terminal.outputBuffer + data
  terminal.outputBuffer = next.length > MAX_OUTPUT_BUFFER_CHARS
    ? next.slice(-MAX_OUTPUT_BUFFER_CHARS)
    : next
}

function countTerminalsForSession(sessionId: string): number {
  let count = 0
  for (const terminal of terminals.values()) {
    if (terminal.meta.sessionId === sessionId) count += 1
  }
  return count
}

function getFlushDelay(terminal: TerminalProcess): number {
  const activeSessionId = activeSessionByWebContents.get(terminal.webContentsId)
  return activeSessionId === terminal.meta.sessionId ? ACTIVE_TERMINAL_FLUSH_MS : BACKGROUND_TERMINAL_FLUSH_MS
}

function flushTerminalData(terminalId: string): void {
  const terminal = terminals.get(terminalId)
  if (!terminal) return
  if (terminal.flushTimer) {
    clearTimeout(terminal.flushTimer)
    terminal.flushTimer = null
  }
  if (!terminal.pendingOutput) return

  const event: TerminalDataEvent = { terminalId, data: terminal.pendingOutput }
  terminal.pendingOutput = ''
  terminal.droppedOutputChars = 0
  terminal.backpressureNoticeQueued = false
  if (!terminal.webContents.isDestroyed()) {
    terminal.webContents.send(TERMINAL_IPC_CHANNELS.DATA, event)
  }
}

function scheduleTerminalFlush(terminal: TerminalProcess): void {
  if (terminal.flushTimer) return
  terminal.flushTimer = setTimeout(() => {
    flushTerminalData(terminal.meta.id)
  }, getFlushDelay(terminal))
}

function enqueueTerminalData(terminalId: string, data: string): void {
  const terminal = terminals.get(terminalId)
  if (!terminal) return

  appendOutputBuffer(terminal, data)
  terminal.pendingOutput += data
  if (terminal.pendingOutput.length > MAX_PENDING_OUTPUT_CHARS) {
    const overflow = terminal.pendingOutput.length - MAX_PENDING_OUTPUT_CHARS
    terminal.droppedOutputChars += overflow
    const shouldQueueNotice = !terminal.backpressureNoticeQueued
    if (shouldQueueNotice) {
      terminal.backpressureNoticeQueued = true
      console.warn(`[TerminalService] 终端 ${terminalId} 输出过快，已丢弃 ${overflow} 个字符`)
    }
    const notice = shouldQueueNotice || terminal.pendingOutput.startsWith(TERMINAL_BACKPRESSURE_NOTICE)
      ? TERMINAL_BACKPRESSURE_NOTICE
      : ''
    const outputWithoutNotice = terminal.pendingOutput.startsWith(TERMINAL_BACKPRESSURE_NOTICE)
      ? terminal.pendingOutput.slice(TERMINAL_BACKPRESSURE_NOTICE.length)
      : terminal.pendingOutput
    const availableChars = Math.max(MAX_PENDING_OUTPUT_CHARS - notice.length, 0)
    terminal.pendingOutput = `${notice}${outputWithoutNotice.slice(-availableChars)}`
  }

  scheduleTerminalFlush(terminal)
}

function rescheduleTerminalFlushesForWebContents(webContentsId: number): void {
  const terminalIds = terminalIdsByWebContents.get(webContentsId)
  if (!terminalIds) return
  for (const terminalId of terminalIds) {
    const terminal = terminals.get(terminalId)
    if (!terminal || !terminal.pendingOutput || !terminal.flushTimer) continue
    clearTimeout(terminal.flushTimer)
    terminal.flushTimer = null
    scheduleTerminalFlush(terminal)
  }
}

export async function startTerminal(input: TerminalStartInput, webContents: WebContents): Promise<TerminalSession> {
  if (terminals.size >= MAX_TERMINALS_TOTAL) {
    throw new Error(`Proma 最多只能同时打开 ${MAX_TERMINALS_TOTAL} 个终端`)
  }
  if (countTerminalsForSession(input.sessionId) >= MAX_TERMINALS_PER_SESSION) {
    throw new Error(`当前会话最多只能同时打开 ${MAX_TERMINALS_PER_SESSION} 个终端`)
  }

  if (!existsSync(input.cwd)) {
    throw new Error('终端工作目录不存在')
  }
  const cwd = input.cwd
  const command = await resolveShellCommand()
  const cols = clampSize(input.cols, 80, 10, 500)
  const rows = clampSize(input.rows, 24, 4, 200)
  const ptyProcess = pty.spawn(command.shell, command.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: buildTerminalEnv(),
  })

  const meta: TerminalSession = {
    id: createTerminalId(),
    sessionId: input.sessionId,
    cwd,
    shell: basename(command.shell),
    pid: ptyProcess.pid,
    title: basename(cwd) || 'Terminal',
    createdAt: Date.now(),
    cols,
    rows,
  }

  const webContentsId = trackTerminalForWebContents(meta.id, webContents)
  terminals.set(meta.id, {
    meta,
    ptyProcess,
    webContents,
    webContentsId,
    outputBuffer: '',
    pendingOutput: '',
    flushTimer: null,
    droppedOutputChars: 0,
    backpressureNoticeQueued: false,
  })

  ptyProcess.onData((data) => {
    enqueueTerminalData(meta.id, data)
  })

  ptyProcess.onExit(({ exitCode, signal }) => {
    flushTerminalData(meta.id)
    meta.exitCode = exitCode
    removeTerminal(meta.id)
    const event: TerminalExitEvent = { terminalId: meta.id, exitCode, signal: signal?.toString() ?? null }
    if (!webContents.isDestroyed()) webContents.send(TERMINAL_IPC_CHANNELS.EXIT, event)
  })

  return meta
}

export function listTerminalsForSession(sessionId: string, webContentsId: number): TerminalListResult {
  const sessionTerminals = Array.from(terminals.values())
    .filter((terminal) => terminal.webContentsId === webContentsId && terminal.meta.sessionId === sessionId)
    .sort((a, b) => a.meta.createdAt - b.meta.createdAt)
  const outputByTerminalId: Record<string, string> = {}
  for (const terminal of sessionTerminals) {
    outputByTerminalId[terminal.meta.id] = terminal.outputBuffer
  }
  return {
    terminals: sessionTerminals.map((terminal) => ({ ...terminal.meta })),
    outputByTerminalId,
  }
}

export function writeTerminal(terminalId: string, data: string, webContentsId: number): void {
  const terminal = getOwnedTerminal(terminalId, webContentsId)
  if (!terminal) return
  terminal.ptyProcess.write(data)
}

export function resizeTerminal(input: TerminalResizeInput, webContentsId: number): void {
  const terminal = getOwnedTerminal(input.terminalId, webContentsId)
  if (!terminal) return
  const cols = clampSize(input.cols, terminal.meta.cols, 10, 500)
  const rows = clampSize(input.rows, terminal.meta.rows, 4, 200)
  terminal.meta.cols = cols
  terminal.meta.rows = rows
  terminal.ptyProcess.resize(cols, rows)
}

export function stopTerminal(terminalId: string, webContentsId: number): void {
  const ownedTerminal = getOwnedTerminal(terminalId, webContentsId)
  if (!ownedTerminal) return
  flushTerminalData(terminalId)
  const terminal = removeTerminal(terminalId)
  if (!terminal) return
  terminal.ptyProcess.kill()
}

export function stopTerminalsForWebContents(webContentsId: number): void {
  const terminalIds = Array.from(terminalIdsByWebContents.get(webContentsId) ?? [])
  for (const terminalId of terminalIds) {
    flushTerminalData(terminalId)
    const terminal = removeTerminal(terminalId)
    if (!terminal) continue
    terminal.ptyProcess.kill()
  }
  activeSessionByWebContents.delete(webContentsId)
}

/**
 * 停止指定会话的全部终端。会话被删除时调用，避免后台 PTY 进程泄漏并持续占用全局名额。
 * 注意：仅在会话真正删除时使用，组件临时卸载（切换 Tab）不应调用，否则会破坏重连体验。
 */
export function stopTerminalsForSession(sessionId: string): void {
  const terminalIds = Array.from(terminals.values())
    .filter((terminal) => terminal.meta.sessionId === sessionId)
    .map((terminal) => terminal.meta.id)
  for (const terminalId of terminalIds) {
    flushTerminalData(terminalId)
    const terminal = removeTerminal(terminalId)
    if (!terminal) continue
    terminal.ptyProcess.kill()
  }
}

export function stopAllTerminals(): void {
  for (const id of Array.from(terminals.keys())) {
    flushTerminalData(id)
    const terminal = removeTerminal(id)
    if (!terminal) continue
    terminal.ptyProcess.kill()
  }
  activeSessionByWebContents.clear()
}

export function setActiveTerminalSession(webContentsId: number, sessionId: string | null): void {
  if (sessionId) {
    activeSessionByWebContents.set(webContentsId, sessionId)
  } else {
    activeSessionByWebContents.delete(webContentsId)
  }
  rescheduleTerminalFlushesForWebContents(webContentsId)
}

/**
 * 查询终端是否有前台进程在运行。
 *
 * unix 下 node-pty 的 `.process` 动态反映前台进程组 leader 名：空闲时等于启动 shell 名
 * （如 zsh/bash），运行命令时为该命令名（如 sleep/vim）。据此判断关闭是否会终止用户进程。
 *
 * Windows 下 `.process` 是创建时固定的 shell 名，无法反映前台进程，故保守视为忙
 * （foregroundProcess=null，busy=true），保持与原有「总是确认」一致的行为。
 */
export function getTerminalBusyState(terminalId: string, webContentsId: number): TerminalBusyResult {
  const terminal = getOwnedTerminal(terminalId, webContentsId)
  if (!terminal) return { busy: false, foregroundProcess: null }
  if (process.platform === 'win32') {
    return { busy: true, foregroundProcess: null }
  }
  let foreground: string
  try {
    foreground = terminal.ptyProcess.process
  } catch {
    return { busy: true, foregroundProcess: null }
  }
  const busy = Boolean(foreground) && foreground !== terminal.meta.shell
  return { busy, foregroundProcess: busy ? foreground : null }
}
