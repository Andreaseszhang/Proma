/**
 * 右侧面板终端相关类型与 IPC 通道。
 */

/** 终端会话元数据 */
export interface TerminalSession {
  id: string
  sessionId: string
  cwd: string
  shell: string
  pid: number | null
  title: string
  createdAt: number
  cols: number
  rows: number
  exitCode?: number | null
}

/** 创建终端输入 */
export interface TerminalStartInput {
  sessionId: string
  cwd: string
  cols?: number
  rows?: number
}

/** 列出当前会话已存在的终端输入 */
export interface TerminalListInput {
  sessionId: string
}

/** 当前会话终端快照，用于渲染进程重载后重新接回主进程 PTY */
export interface TerminalListResult {
  terminals: TerminalSession[]
  outputByTerminalId: Record<string, string>
}

/** 写入终端输入 */
export interface TerminalWriteInput {
  terminalId: string
  data: string
}

/** 停止终端输入 */
export interface TerminalStopInput {
  terminalId: string
}

/** 调整终端尺寸输入 */
export interface TerminalResizeInput {
  terminalId: string
  cols: number
  rows: number
}

/** 设置当前可见的终端会话，用于主进程降低后台会话输出刷新频率 */
export interface TerminalSetActiveSessionInput {
  sessionId: string | null
}

/** 查询终端是否有前台进程在运行的输入 */
export interface TerminalBusyInput {
  terminalId: string
}

/**
 * 终端忙碌状态查询结果。
 * busy=true 表示终端内有非 shell 的前台进程在运行（关闭会终止它）。
 * foregroundProcess 为检测到的前台进程名；无法检测（如 Windows）时为 null，此时 busy 保守置为 true。
 */
export interface TerminalBusyResult {
  busy: boolean
  foregroundProcess: string | null
}

/** 终端输出事件 */
export interface TerminalDataEvent {
  terminalId: string
  data: string
}

/** 终端退出事件 */
export interface TerminalExitEvent {
  terminalId: string
  exitCode: number | null
  signal: string | null
}

/** 终端 IPC 通道 */
export const TERMINAL_IPC_CHANNELS = {
  START: 'terminal:start',
  LIST: 'terminal:list',
  WRITE: 'terminal:write',
  RESIZE: 'terminal:resize',
  STOP: 'terminal:stop',
  SET_ACTIVE_SESSION: 'terminal:set-active-session',
  IS_BUSY: 'terminal:is-busy',
  DATA: 'terminal:data',
  EXIT: 'terminal:exit',
} as const
