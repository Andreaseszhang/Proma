/**
 * TerminalPanel — Agent 右侧面板底部终端。
 */

import * as React from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ChevronDown, ChevronUp, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TerminalExitEvent, TerminalSession } from '@proma/shared'

interface TerminalPanelProps {
  sessionId: string
  cwd: string | null
  height?: number | null
  isResizing?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

interface TerminalRuntime {
  terminal: XTerm
  fitAddon: FitAddon
  disposables: Array<{ dispose: () => void }>
}

interface CachedTerminalState {
  terminals: TerminalSession[]
  activeTerminalId: string | null
  isCollapsed: boolean
  starting: boolean
  outputByTerminalId: Map<string, string>
}

interface TerminalTabStyle extends React.CSSProperties {
  '--terminal-tab-indicator-width'?: string
}

const TERMINAL_OUTPUT_LIMIT = 500_000
const MAX_TERMINALS_PER_SESSION = 4
const SHORT_TERMINAL_LABEL_THRESHOLD = 16
const TERMINAL_TAB_LABEL_CHAR_WIDTH = 8
const TERMINAL_TAB_CONTENT_CHROME_WIDTH = 34
const SHORT_TERMINAL_INDICATOR_EXTRA = 80
const MAX_TERMINAL_INDICATOR_WIDTH = 520
const terminalStateBySession = new Map<string, CachedTerminalState>()
const sessionIdByTerminalId = new Map<string, string>()

function getTerminalTabIndicatorWidth(label: string): number {
  const contentWidth = label.length * TERMINAL_TAB_LABEL_CHAR_WIDTH + TERMINAL_TAB_CONTENT_CHROME_WIDTH
  const extraWidth = label.length <= SHORT_TERMINAL_LABEL_THRESHOLD ? SHORT_TERMINAL_INDICATOR_EXTRA : 0
  return Math.min(MAX_TERMINAL_INDICATOR_WIDTH, Math.max(120, Math.round(contentWidth + extraWidth)))
}

function getCachedTerminalState(sessionId: string): CachedTerminalState {
  let state = terminalStateBySession.get(sessionId)
  if (!state) {
    state = {
      terminals: [],
      activeTerminalId: null,
      isCollapsed: false,
      starting: false,
      outputByTerminalId: new Map(),
    }
    terminalStateBySession.set(sessionId, state)
  }
  return state
}

function appendTerminalOutput(state: CachedTerminalState, terminalId: string, data: string): void {
  const previous = state.outputByTerminalId.get(terminalId) ?? ''
  const next = previous.length + data.length > TERMINAL_OUTPUT_LIMIT
    ? (previous + data).slice(-TERMINAL_OUTPUT_LIMIT)
    : previous + data
  state.outputByTerminalId.set(terminalId, next)
}

function cssHslVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value ? `hsl(${value})` : fallback
}

function createTerminalTheme(container: HTMLElement): ITheme {
  const styles = getComputedStyle(container)
  const background = cssHslVar(styles, '--content-area', '#11100f')
  const foreground = cssHslVar(styles, '--foreground', '#e8e0d9')
  const muted = cssHslVar(styles, '--muted-foreground', '#8b8580')
  const primary = cssHslVar(styles, '--primary', '#78e08f')
  const accent = cssHslVar(styles, '--accent-foreground', '#64dce5')
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: cssHslVar(styles, '--primary', '#5a4a42'),
    black: background,
    red: '#ff8a80',
    green: primary,
    yellow: '#f4d35e',
    blue: '#82aaff',
    magenta: '#f5a3c7',
    cyan: accent,
    white: foreground,
    brightBlack: muted,
    brightRed: '#ff9f95',
    brightGreen: primary,
    brightYellow: '#ffe28a',
    brightBlue: '#9bbcff',
    brightMagenta: '#ffc1db',
    brightCyan: accent,
    brightWhite: foreground,
  }
}

export const TerminalPanel = React.forwardRef<HTMLDivElement, TerminalPanelProps>(function TerminalPanel(
  { sessionId, cwd, height, isResizing = false, onCollapsedChange },
  ref
): React.ReactElement {
  const [terminals, setTerminals] = React.useState<TerminalSession[]>([])
  const [activeTerminalId, setActiveTerminalId] = React.useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const [startupError, setStartupError] = React.useState<string | null>(null)
  const terminalsRef = React.useRef<TerminalSession[]>([])
  const runtimesRef = React.useRef<Map<string, TerminalRuntime>>(new Map())
  const containerRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const currentSessionIdRef = React.useRef(sessionId)

  React.useEffect(() => {
    terminalsRef.current = terminals
  }, [terminals])

  React.useEffect(() => {
    currentSessionIdRef.current = sessionId
  }, [sessionId])

  React.useEffect(() => {
    getCachedTerminalState(sessionId).isCollapsed = isCollapsed
    onCollapsedChange?.(isCollapsed)
  }, [isCollapsed, onCollapsedChange, sessionId])

  React.useEffect(() => {
    getCachedTerminalState(sessionId).activeTerminalId = activeTerminalId
  }, [activeTerminalId, sessionId])

  const activeTerminal = terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null
  const hasReachedSessionLimit = terminals.length >= MAX_TERMINALS_PER_SESSION
  const createTerminalDisabled = !cwd || hasReachedSessionLimit
  const createTerminalTooltip = !cwd
    ? '等待会话初始化'
    : hasReachedSessionLimit
      ? `当前会话最多 ${MAX_TERMINALS_PER_SESSION} 个终端`
      : '新建终端'

  const resizeTerminal = React.useCallback((terminalId: string) => {
    const runtime = runtimesRef.current.get(terminalId)
    if (!runtime) return
    try {
      runtime.fitAddon.fit()
      runtime.terminal.scrollToBottom()
      window.electronAPI.resizeTerminal({
        terminalId,
        cols: runtime.terminal.cols,
        rows: runtime.terminal.rows,
      }).catch(console.error)
    } catch (error) {
      console.error('[TerminalPanel] 调整终端尺寸失败:', error)
    }
  }, [])

  const focusTerminal = React.useCallback((terminalId: string | null) => {
    if (!terminalId) return
    const runtime = runtimesRef.current.get(terminalId)
    runtime?.terminal.focus()
  }, [])

  const refreshTerminalThemes = React.useCallback(() => {
    for (const [terminalId, runtime] of runtimesRef.current) {
      const container = containerRefs.current.get(terminalId)
      if (!container) continue
      runtime.terminal.options.theme = createTerminalTheme(container)
    }
  }, [])

  const setupTerminal = React.useCallback((meta: TerminalSession) => {
    if (runtimesRef.current.has(meta.id)) return
    const container = containerRefs.current.get(meta.id)
    if (!container) return

    const terminal = new XTerm({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'block',
      disableStdin: meta.exitCode !== undefined,
      fontFamily: 'Menlo, Monaco, "Cascadia Mono", "SFMono-Regular", monospace',
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1.35,
      scrollback: 8000,
      theme: createTerminalTheme(container),
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    const dataDisposable = terminal.onData((data) => {
      window.electronAPI.writeTerminal({ terminalId: meta.id, data }).catch(console.error)
    })

    const runtime: TerminalRuntime = {
      terminal,
      fitAddon,
      disposables: [dataDisposable],
    }
    runtimesRef.current.set(meta.id, runtime)

    const owningSessionId = sessionIdByTerminalId.get(meta.id) ?? sessionId
    const cachedOutput = getCachedTerminalState(owningSessionId).outputByTerminalId.get(meta.id)
    if (cachedOutput) terminal.write(cachedOutput, () => terminal.scrollToBottom())

    requestAnimationFrame(() => {
      resizeTerminal(meta.id)
      if (meta.id === activeTerminalId) terminal.focus()
    })
  }, [activeTerminalId, resizeTerminal])

  const startNewTerminal = React.useCallback(async () => {
    if (!cwd) return
    const targetSessionId = sessionId
    const cachedState = getCachedTerminalState(targetSessionId)
    if (cachedState.starting) return
    if (cachedState.terminals.length >= MAX_TERMINALS_PER_SESSION) return
    cachedState.starting = true
    setStartupError(null)
    try {
      const meta = await window.electronAPI.startTerminal({ sessionId: targetSessionId, cwd, cols: 80, rows: 24 })
      const state = getCachedTerminalState(targetSessionId)
      const title = state.terminals.length === 0 ? 'Terminal 1' : `Terminal ${state.terminals.length + 1}`
      const terminal = { ...meta, title }
      state.terminals = [...state.terminals, terminal]
      state.activeTerminalId = meta.id
      state.starting = false
      sessionIdByTerminalId.set(meta.id, targetSessionId)
      if (currentSessionIdRef.current === targetSessionId) {
        setTerminals(state.terminals)
        setActiveTerminalId(meta.id)
      }
    } catch (error) {
      getCachedTerminalState(targetSessionId).starting = false
      if (currentSessionIdRef.current === targetSessionId) {
        setStartupError(error instanceof Error ? error.message : '启动终端失败')
      }
      console.error('[TerminalPanel] 启动终端失败:', error)
    }
  }, [cwd, sessionId])

  const disposeRendererTerminals = React.useCallback(() => {
    for (const runtime of runtimesRef.current.values()) {
      runtime.disposables.forEach((disposable) => disposable.dispose())
      runtime.terminal.dispose()
    }
    runtimesRef.current.clear()
    containerRefs.current.clear()
  }, [])

  React.useEffect(() => {
    window.electronAPI.setActiveTerminalSession({ sessionId }).catch(console.error)
    return () => {
      window.electronAPI.setActiveTerminalSession({ sessionId: null }).catch(console.error)
    }
  }, [sessionId])

  React.useEffect(() => {
    disposeRendererTerminals()
    const state = getCachedTerminalState(sessionId)
    setIsCollapsed(state.isCollapsed)
    setStartupError(null)
    terminalsRef.current = []

    let cancelled = false
    async function loadExistingTerminals(): Promise<void> {
      try {
        const snapshot = await window.electronAPI.listTerminals({ sessionId })
        if (cancelled || currentSessionIdRef.current !== sessionId) return

        const nextState = getCachedTerminalState(sessionId)
        // 主进程的 title 退化为 cwd 的 basename（即会话 UUID），重连时按渲染端「Terminal N」约定重新编号
        const renumbered = snapshot.terminals.map((terminal, index) => ({ ...terminal, title: `Terminal ${index + 1}` }))
        nextState.terminals = renumbered
        nextState.outputByTerminalId = new Map(Object.entries(snapshot.outputByTerminalId))
        const terminalIds = new Set(renumbered.map((terminal) => terminal.id))
        if (!nextState.activeTerminalId || !terminalIds.has(nextState.activeTerminalId)) {
          nextState.activeTerminalId = renumbered[0]?.id ?? null
        }
        for (const terminal of renumbered) {
          sessionIdByTerminalId.set(terminal.id, sessionId)
        }
        setTerminals(nextState.terminals)
        setActiveTerminalId(nextState.activeTerminalId)
        terminalsRef.current = nextState.terminals
        if (nextState.terminals.length === 0 && cwd && !nextState.starting) {
          void startNewTerminal()
        }
      } catch (error) {
        console.error('[TerminalPanel] 加载已有终端失败:', error)
        const fallbackState = getCachedTerminalState(sessionId)
        setTerminals(fallbackState.terminals)
        setActiveTerminalId(fallbackState.activeTerminalId ?? fallbackState.terminals[0]?.id ?? null)
        terminalsRef.current = fallbackState.terminals
        if (fallbackState.terminals.length === 0 && cwd && !fallbackState.starting) void startNewTerminal()
      }
    }

    void loadExistingTerminals()

    return () => {
      cancelled = true
      disposeRendererTerminals()
      terminalsRef.current = []
    }
  }, [sessionId, cwd, disposeRendererTerminals, startNewTerminal])

  React.useEffect(() => {
    const offData = window.electronAPI.onTerminalData((event) => {
      const owningSessionId = sessionIdByTerminalId.get(event.terminalId)
      if (owningSessionId) {
        appendTerminalOutput(getCachedTerminalState(owningSessionId), event.terminalId, event.data)
      }
      const runtime = runtimesRef.current.get(event.terminalId)
      if (runtime) {
        runtime.terminal.write(event.data, () => runtime.terminal.scrollToBottom())
      }
    })

    const offExit = window.electronAPI.onTerminalExit((event: TerminalExitEvent) => {
      const message = `\r\n[进程已退出，code=${event.exitCode ?? 'null'}${event.signal ? `, signal=${event.signal}` : ''}]\r\n`
      const owningSessionId = sessionIdByTerminalId.get(event.terminalId)
      const state = owningSessionId ? getCachedTerminalState(owningSessionId) : null
      if (state) {
        appendTerminalOutput(state, event.terminalId, message)
        state.terminals = state.terminals.map((terminal) => (
          terminal.id === event.terminalId ? { ...terminal, exitCode: event.exitCode } : terminal
        ))
      }
      const runtime = runtimesRef.current.get(event.terminalId)
      if (runtime) {
        runtime.terminal.write(message, () => runtime.terminal.scrollToBottom())
      }
      if (owningSessionId && currentSessionIdRef.current === owningSessionId && state) {
        setTerminals(state.terminals)
      }
    })

    return () => {
      offData()
      offExit()
    }
  }, [])

  React.useEffect(() => {
    for (const meta of terminals) setupTerminal(meta)
  }, [setupTerminal, terminals])

  React.useEffect(() => {
    const container = activeTerminalId ? containerRefs.current.get(activeTerminalId) : null
    if (!container || !activeTerminalId || isCollapsed) return
    const observer = new ResizeObserver(() => resizeTerminal(activeTerminalId))
    observer.observe(container)
    resizeTerminal(activeTerminalId)
    focusTerminal(activeTerminalId)
    return () => observer.disconnect()
  }, [activeTerminalId, focusTerminal, isCollapsed, resizeTerminal])

  React.useEffect(() => {
    if (isCollapsed || !activeTerminalId) return
    requestAnimationFrame(() => {
      resizeTerminal(activeTerminalId)
      focusTerminal(activeTerminalId)
    })
  }, [activeTerminalId, focusTerminal, isCollapsed, resizeTerminal])

  React.useEffect(() => {
    const html = document.documentElement
    let frame = 0
    const scheduleRefresh = (): void => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        refreshTerminalThemes()
      })
    }
    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(html, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [refreshTerminalThemes])

  const removeTerminalFromView = React.useCallback((terminalId: string) => {
    const runtime = runtimesRef.current.get(terminalId)
    if (runtime) {
      runtime.disposables.forEach((disposable) => disposable.dispose())
      runtime.terminal.dispose()
      runtimesRef.current.delete(terminalId)
    }
    const state = getCachedTerminalState(sessionId)
    state.outputByTerminalId.delete(terminalId)
    sessionIdByTerminalId.delete(terminalId)
    setTerminals((prev) => {
      const next = prev.filter((terminal) => terminal.id !== terminalId)
      state.terminals = next
      if (activeTerminalId === terminalId) {
        const nextActiveId = next[0]?.id ?? null
        state.activeTerminalId = nextActiveId
        setActiveTerminalId(nextActiveId)
      }
      return next
    })
  }, [activeTerminalId, sessionId])

  const closeTerminal = React.useCallback(async (terminalId: string) => {
    if (terminals.length <= 1) return
    const targetTerminal = terminals.find((terminal) => terminal.id === terminalId)
    // 仅当终端内确有未退出的前台进程时才二次确认，空闲 shell 直接关闭，避免无谓打扰
    if (targetTerminal && targetTerminal.exitCode === undefined) {
      let busy = true
      let foregroundProcess: string | null = null
      try {
        const state = await window.electronAPI.isTerminalBusy({ terminalId })
        busy = state.busy
        foregroundProcess = state.foregroundProcess
      } catch (error) {
        // 查询失败时保守确认，避免误杀正在运行的进程
        console.error('[TerminalPanel] 查询终端忙碌状态失败:', error)
      }
      if (busy) {
        const runningHint = foregroundProcess ? `正在运行 ${foregroundProcess}，` : ''
        const confirmed = window.confirm(`终端 "${targetTerminal.title}" ${runningHint}关闭会终止其中的进程，确定要关闭吗？`)
        if (!confirmed) return
      }
    }
    window.electronAPI.stopTerminal({ terminalId })
      .then(() => removeTerminalFromView(terminalId))
      .catch((error) => {
        console.error('[TerminalPanel] 关闭终端失败:', error)
        setStartupError(error instanceof Error ? error.message : '关闭终端失败')
      })
  }, [removeTerminalFromView, terminals])

  return (
    <div
      ref={ref}
      style={!isCollapsed && height ? { height } : undefined}
      className={cn(
        'titlebar-no-drag flex flex-col border-t border-border/40 bg-content-area',
        !isResizing && 'transition-[height,flex-basis] duration-150 ease-out',
        isCollapsed ? 'h-9 min-h-9 flex-none' : height ? 'min-h-[180px] flex-none' : 'basis-1/2 min-h-[190px]',
      )}
    >
      <div className={cn(
        'h-9 flex items-end gap-1 px-2 flex-shrink-0 bg-content-area',
        !isCollapsed && 'border-b border-border/40',
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsCollapsed((collapsed) => !collapsed)}
              className="mb-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-label={isCollapsed ? '显示终端' : '隐藏终端'}
            >
              {isCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{isCollapsed ? '显示终端' : '隐藏终端'}</TooltipContent>
        </Tooltip>
        <div className="terminal-tabbar flex min-w-0 flex-1 items-end gap-1 overflow-hidden">
          {terminals.map((terminal, index) => {
            const active = terminal.id === activeTerminalId
            const label = terminal.title || `Terminal ${index + 1}`
            const tabStyle: TerminalTabStyle | undefined = active
              ? { '--terminal-tab-indicator-width': `${getTerminalTabIndicatorWidth(label)}px` }
              : undefined
            return (
              <div
                key={terminal.id}
                style={tabStyle}
                className={cn(
                  'terminal-tab group relative flex h-8 min-w-0 flex-1 basis-0 items-center gap-0 rounded-t-md text-xs transition-colors',
                  active
                    ? 'terminal-tab-active text-foreground'
                    : 'terminal-tab-inactive text-muted-foreground hover:text-foreground',
                )}
                title={`${terminal.shell} · ${terminal.cwd}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTerminalId(terminal.id)
                    if (isCollapsed) {
                      setIsCollapsed(false)
                    } else {
                      focusTerminal(terminal.id)
                    }
                  }}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left outline-none"
                  aria-current={active ? 'page' : undefined}
                >
                  <TerminalIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
                {terminal.exitCode !== undefined && <span className="size-1.5 shrink-0 rounded-full bg-destructive/80" />}
                {terminals.length > 1 && (
                  <button
                    type="button"
                    className="mr-1 flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-colors hover:bg-muted/60 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      void closeTerminal(terminal.id)
                    }}
                    aria-label={`关闭 ${label}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                if (createTerminalDisabled) return
                setIsCollapsed(false)
                void startNewTerminal()
              }}
              disabled={createTerminalDisabled}
              className="mb-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="新建终端"
            >
              <Plus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{createTerminalTooltip}</TooltipContent>
        </Tooltip>
      </div>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          isCollapsed && 'hidden',
        )}
        onMouseDown={() => focusTerminal(activeTerminal?.id ?? null)}
      >
        {terminals.length === 0 && (
          <div className="flex h-full items-center px-4 font-mono text-xs text-muted-foreground">
            {startupError ?? (cwd ? '正在启动终端...' : '等待会话初始化...')}
          </div>
        )}
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={cn(
              'absolute inset-0 min-h-0 p-2',
              terminal.id === activeTerminalId ? 'block' : 'hidden',
            )}
          >
            <div
              ref={(node) => {
                if (node) {
                  containerRefs.current.set(terminal.id, node)
                  setupTerminal(terminal)
                } else {
                  containerRefs.current.delete(terminal.id)
                }
              }}
              className="h-full w-full min-h-0 overflow-hidden"
            />
          </div>
        ))}
      </div>
    </div>
  )
})
