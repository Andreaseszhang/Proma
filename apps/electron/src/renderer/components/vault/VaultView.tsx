import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, ChevronRight, CircleHelp, Folder, FolderOpen, Loader2, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { VaultCandidate, VaultFileEntry, VaultReadResult, VaultSummary, SkillMeta } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VaultLiveMarkdownEditor, type VaultLiveMarkdownEditorHandle } from './VaultLiveMarkdownEditor'
import { VaultReferencePicker } from './VaultReferencePicker'
import { SkillDetailSheet } from '@/components/agent-skills/SkillDetailSheet'
import {
  selectedVaultFileAtom,
  vaultReadResultAtom,
  vaultRefreshTokenAtom,
  pendingVaultQuoteAtom,
} from '@/atoms/vault-atoms'
import { cn } from '@/lib/utils'
import { agentWorkspacesAtom, agentSessionsAtom, currentAgentWorkspaceIdAtom, workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import { activeViewAtom, agentSkillsTabAtom } from '@/atoms/active-view'
import { planningSelectedCalendarEventIdAtom, planningSelectedTodoIdAtom, planningTabAtom } from '@/atoms/planning-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import {
  resolveVaultWikiLink,
  serializeVaultReference,
  type VaultReference,
  type VaultReferenceRange,
  type VaultReferenceType,
} from './vault-reference-utils'
import { getVaultEditorKey, shouldAdoptVaultReadContent } from './vault-editor-lifecycle'
import { getVaultSidebarLayout } from './vault-sidebar-layout'
import { OBSIDIAN_NAME, ObsidianIcon, PROMA_MANAGED_VAULT_LABEL } from '@/components/obsidian/obsidian-brand'

function displayDocumentTitle(filename: string): string {
  return filename.replace(/\.md$/i, '')
}

function replaceVaultFrontmatterProperties(markdown: string, entries: Array<{ key: string; value: string }>): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.replace(/^\uFEFF/, '') !== '---') return markdown
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (closingIndex < 0) return markdown
  const propertyLines = entries.map(({ key, value }) => `${key}: ${value}`)
  return [...lines.slice(0, 1), ...propertyLines, ...lines.slice(closingIndex)].join(newline)
}

interface VaultFolderNode {
  name: string
  relativePath: string
  folders: Map<string, VaultFolderNode>
  files: VaultFileEntry[]
}

function buildVaultTree(files: VaultFileEntry[]): VaultFolderNode {
  const root: VaultFolderNode = { name: '', relativePath: '', folders: new Map(), files: [] }

  for (const file of files) {
    const segments = file.relativePath.split('/')
    const filename = segments.pop()
    if (!filename) continue

    let parent = root
    for (const folderName of segments) {
      const relativePath = parent.relativePath ? `${parent.relativePath}/${folderName}` : folderName
      let folder = parent.folders.get(folderName)
      if (!folder) {
        folder = { name: folderName, relativePath, folders: new Map(), files: [] }
        parent.folders.set(folderName, folder)
      }
      parent = folder
    }
    parent.files.push(file)
  }

  return root
}

function collectFolderPaths(folder: VaultFolderNode): string[] {
  return Array.from(folder.folders.values()).flatMap((child) => [child.relativePath, ...collectFolderPaths(child)])
}

function VaultFileList({
  files,
  selectedPath,
  onSelect,
  onDelete,
}: {
  files: VaultFileEntry[]
  selectedPath: string | null
  onSelect: (relativePath: string) => void
  onDelete: (file: VaultFileEntry) => void
}): React.ReactElement {
  const tree = React.useMemo(() => buildVaultTree(files), [files])
  const folderPaths = React.useMemo(() => collectFolderPaths(tree), [tree])
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(() => new Set(folderPaths))

  React.useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      for (const path of folderPaths) next.add(path)
      return next
    })
  }, [folderPaths])

  if (files.length === 0) {
    return <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">没有可显示的 Markdown 笔记</p>
  }

  const renderEntries = (folder: VaultFolderNode, depth: number): React.ReactNode => (
    <>
      {Array.from(folder.folders.values())
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
        .map((child) => {
          const expanded = expandedFolders.has(child.relativePath)
          return (
            <React.Fragment key={child.relativePath}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? '收起' : '展开'}文件夹 ${child.name}`}
                onClick={() => {
                  setExpandedFolders((current) => {
                    const next = new Set(current)
                    if (next.has(child.relativePath)) next.delete(child.relativePath)
                    else next.add(child.relativePath)
                    return next
                  })
                }}
                className="flex h-8 w-full min-w-0 items-center gap-1 rounded-md pr-2 text-left text-[13px] text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
                style={{ paddingLeft: `${10 + Math.min(depth, 6) * 14}px` }}
              >
                {expanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
                {expanded ? <FolderOpen size={14} className="shrink-0 text-primary/80" /> : <Folder size={14} className="shrink-0 text-primary/80" />}
                <span className="min-w-0 truncate">{child.name}</span>
              </button>
              {expanded && (
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-px bg-border/70"
                    style={{ left: `${17 + Math.min(depth, 6) * 14}px` }}
                  />
                  {renderEntries(child, depth + 1)}
                </div>
              )}
            </React.Fragment>
          )
        })}
      {folder.files
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
        .map((file) => {
          const selected = selectedPath === file.relativePath
          return (
            <div
              key={file.relativePath}
              className={cn(
                'group flex h-8 w-full min-w-0 items-center rounded-md transition-colors',
                selected ? 'bg-accent text-accent-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted/70 hover:text-foreground',
              )}
              style={{ paddingLeft: `${18 + Math.min(depth, 6) * 14}px` }}
            >
              <button
                type="button"
                title={file.relativePath}
                onClick={() => onSelect(file.relativePath)}
                className="h-full min-w-0 flex-1 truncate text-left text-[13px]"
              >
                {displayDocumentTitle(file.name)}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`删除笔记 ${displayDocumentTitle(file.name)}`}
                    onClick={() => onDelete(file)}
                    className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">删除笔记</TooltipContent>
              </Tooltip>
            </div>
          )
        })}
    </>
  )

  return <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 titlebar-no-drag">{renderEntries(tree, 0)}</div>
}

function VaultMarkdownEditor({
  readResult,
  files,
  workspaceSlug,
  onSave,
  onRename,
  onOpenWikiLink,
  onActivateReference,
  onOpenTutorial,
}: {
  readResult: VaultReadResult
  files: VaultFileEntry[]
  workspaceSlug: string | null
  onSave: (nextContent: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onOpenWikiLink: (target: string) => void
  onActivateReference: (reference: VaultReferenceRange) => void
  onOpenTutorial: () => void
}): React.ReactElement {
  const [draft, setDraft] = React.useState(readResult.content)
  const previousReadContentRef = React.useRef(readResult.content)
  const [saving, setSaving] = React.useState(false)
  const [filename, setFilename] = React.useState(displayDocumentTitle(readResult.relativePath.split('/').pop() ?? readResult.relativePath))
  const [referencePicker, setReferencePicker] = React.useState<{ reference?: VaultReference; range?: VaultReferenceRange; type?: VaultReferenceType } | null>(null)
  const editorPageRef = React.useRef<HTMLDivElement>(null)
  const editorRef = React.useRef<VaultLiveMarkdownEditorHandle>(null)
  React.useEffect(() => {
    const previousReadContent = previousReadContentRef.current
    previousReadContentRef.current = readResult.content
    if (!shouldAdoptVaultReadContent(draft, previousReadContent)) return
    setDraft(readResult.content)
  }, [draft, readResult.content])

  const updateProperties = React.useCallback((entries: Array<{ key: string; value: string }>): void => {
    setDraft((current) => replaceVaultFrontmatterProperties(current, entries))
  }, [])

  const handleEditorPageWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('.vault-ink-mde')) return
    const scroller = editorPageRef.current?.querySelector<HTMLElement>('.vault-ink-mde .cm-scroller')
    if (!scroller) return
    scroller.scrollTop += event.deltaY
    scroller.scrollLeft += event.deltaX
  }

  const save = async (): Promise<void> => {
    if (saving || draft === readResult.content) return
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  const rename = async (): Promise<void> => {
    const currentName = displayDocumentTitle(readResult.relativePath.split('/').pop() ?? readResult.relativePath)
    if (!filename.trim() || filename.trim() === currentName) {
      setFilename(currentName)
      return
    }
    await onRename(filename.trim())
  }

  const selectReference = (reference: VaultReference): void => {
    const edit = referencePicker
    const marker = serializeVaultReference(reference)
    if (edit?.range) {
      setDraft((current) => current.slice(0, edit.range!.from) + marker + current.slice(edit.range!.to))
    } else {
      editorRef.current?.insertReference(reference)
    }
    setReferencePicker(null)
  }

  return (
    <div
      ref={editorPageRef}
      onWheel={handleEditorPageWheel}
      className="min-h-0 flex-1 overflow-hidden titlebar-no-drag"
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-5 py-5">
        <div className="mb-8 flex min-w-0 items-center gap-2">
          <input
            aria-label="重命名笔记"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            onBlur={() => { void rename() }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setFilename(displayDocumentTitle(readResult.relativePath.split('/').pop() ?? readResult.relativePath))
                event.currentTarget.blur()
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent px-4 text-3xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {draft !== readResult.content ? (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              disabled={saving}
              onClick={() => { void save() }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save size={14} />}
              {saving ? '保存中' : '保存'}
            </Button>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">已保存</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${OBSIDIAN_NAME} 使用帮助`}
                onClick={onOpenTutorial}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <CircleHelp size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{OBSIDIAN_NAME} 使用帮助（Cmd/Ctrl + S 保存）</TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1">
          <VaultLiveMarkdownEditor
            ref={editorRef}
            value={draft}
            files={files}
            workspaceSlug={workspaceSlug}
            onChange={setDraft}
            onSave={() => { void save() }}
            onOpenWikiLink={onOpenWikiLink}
            onActivateReference={onActivateReference}
            onChangeProperties={updateProperties}
            onEditReference={(reference) => setReferencePicker({ reference, range: reference })}
          />
        </div>
      </div>
      <VaultReferencePicker
        open={referencePicker !== null}
        workspaceSlug={workspaceSlug}
        initialType={referencePicker?.type}
        initialReference={referencePicker?.reference}
        onOpenChange={(open) => {
          if (!open) setReferencePicker(null)
        }}
        onSelect={selectReference}
      />
    </div>
  )
}

function VaultMarkdownPane({
  readResult,
  files,
  loading,
  workspaceSlug,
  onSave,
  onRename,
  onOpenWikiLink,
  onActivateReference,
  onOpenTutorial,
}: {
  readResult: VaultReadResult | null
  files: VaultFileEntry[]
  loading: boolean
  workspaceSlug: string | null
  onSave: (nextContent: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onOpenWikiLink: (target: string) => void
  onActivateReference: (reference: VaultReferenceRange) => void
  onOpenTutorial: () => void
}): React.ReactElement {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!readResult) return <></>

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-muted/25">
      <VaultMarkdownEditor
        key={getVaultEditorKey(readResult.relativePath)}
        readResult={readResult}
        files={files}
        workspaceSlug={workspaceSlug}
        onSave={onSave}
        onRename={onRename}
        onOpenWikiLink={onOpenWikiLink}
        onActivateReference={onActivateReference}
        onOpenTutorial={onOpenTutorial}
      />
    </section>
  )
}

export function VaultView({ embedded = false, sessionId }: { embedded?: boolean; sessionId?: string }): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setSkillsTab = useSetAtom(agentSkillsTabAtom)
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)
  const setPlanningTab = useSetAtom(planningTabAtom)
  const setSelectedTodoId = useSetAtom(planningSelectedTodoIdAtom)
  const setSelectedCalendarEventId = useSetAtom(planningSelectedCalendarEventIdAtom)
  const openSession = useOpenSession()
  const workspaceSlug = React.useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.slug ?? null,
    [currentWorkspaceId, workspaces],
  )
  const [config, setConfig] = React.useState<VaultSummary | null>(null)
  const [candidates, setCandidates] = React.useState<VaultCandidate[]>([])
  const [vaultDiscoveryComplete, setVaultDiscoveryComplete] = React.useState(false)
  const [files, setFiles] = React.useState<VaultFileEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [fileLoading, setFileLoading] = React.useState(false)
  const [selectedFile, setSelectedFile] = useAtom(selectedVaultFileAtom)
  const [readResult, setReadResult] = useAtom(vaultReadResultAtom)
  const [refreshToken, setRefreshToken] = useAtom(vaultRefreshTokenAtom)
  const [pendingQuote, setPendingQuote] = useAtom(pendingVaultQuoteAtom)
  const [quoteDialogOpen, setQuoteDialogOpen] = React.useState(false)
  const [quoteTarget, setQuoteTarget] = React.useState('')
  const [quoteNewPath, setQuoteNewPath] = React.useState('')
  const [quoting, setQuoting] = React.useState(false)
  const [vaultHelpOpen, setVaultHelpOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<VaultFileEntry | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [vaultSidebarCollapsed, setVaultSidebarCollapsed] = React.useState(false)
  const vaultSidebarLayout = getVaultSidebarLayout(vaultSidebarCollapsed, embedded)
  const [skillDetail, setSkillDetail] = React.useState<{ skill: SkillMeta; isBuiltin: boolean; skillsDir: string } | null>(null)
  const [skillUpdating, setSkillUpdating] = React.useState(false)
  const selectedFileRef = React.useRef(selectedFile)
  const readRequestRef = React.useRef(0)
  const initialRefreshRef = React.useRef(true)

  React.useEffect(() => {
    selectedFileRef.current = selectedFile
  }, [selectedFile])

  React.useEffect(() => {
    if (!sessionId) return
    void window.electronAPI.setVaultUserContext(sessionId, selectedFileRef.current, true)
    return () => {
      void window.electronAPI.setVaultUserContext(sessionId, null, false)
    }
  }, [sessionId])

  React.useEffect(() => {
    if (!sessionId) return
    void window.electronAPI.setVaultUserContext(sessionId, selectedFile, true)
  }, [selectedFile, sessionId])

  const refresh = React.useCallback(async ({ showLoading = false } = {}): Promise<void> => {
    if (showLoading) setLoading(true)
    try {
      const nextConfig = await window.electronAPI.ensureDefaultVault()
      setConfig(nextConfig)
      setFiles(nextConfig ? await window.electronAPI.listVaultFiles() : [])
      if (!nextConfig) {
        setSelectedFile(null)
        setReadResult(null)
      } else if (selectedFileRef.current) {
        const relativePath = selectedFileRef.current
        const requestId = ++readRequestRef.current
        try {
          const result = await window.electronAPI.readVaultFile(relativePath)
          if (requestId === readRequestRef.current) setReadResult(result)
        } catch {
          if (requestId === readRequestRef.current) {
            setSelectedFile(null)
            setReadResult(null)
            toast.message('已打开的笔记不存在或无法刷新')
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `无法读取 ${OBSIDIAN_NAME}`)
    } finally {
      setLoading(false)
    }
  }, [setReadResult, setSelectedFile])

  React.useEffect(() => {
    const showLoading = initialRefreshRef.current
    initialRefreshRef.current = false
    void refresh({ showLoading })
  }, [refresh, refreshToken])

  React.useEffect(() => {
    if (!pendingQuote || !config) return
    setQuoteTarget(selectedFile ?? files[0]?.relativePath ?? '__new__')
    setQuoteNewPath(`${config.inboxPath}/Quote ${new Intl.DateTimeFormat('en-CA').format(new Date())}.md`)
    setQuoteDialogOpen(true)
  }, [config, files, pendingQuote, selectedFile])

  React.useEffect(() => {
    if (config || vaultDiscoveryComplete) return
    void window.electronAPI.listVaultCandidates()
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setVaultDiscoveryComplete(true))
  }, [config, vaultDiscoveryComplete])

  const openFile = React.useCallback(async (relativePath: string): Promise<void> => {
    const requestId = ++readRequestRef.current
    setSelectedFile(relativePath)
    setFileLoading(true)
    try {
      const result = await window.electronAPI.readVaultFile(relativePath)
      if (requestId === readRequestRef.current) setReadResult(result)
    } catch (error) {
      if (requestId === readRequestRef.current) {
        toast.error(error instanceof Error ? error.message : '无法打开笔记')
        setReadResult(null)
      }
    } finally {
      if (requestId === readRequestRef.current) setFileLoading(false)
    }
  }, [setReadResult, setSelectedFile])

  const openSkillDetail = React.useCallback(async (slug: string): Promise<void> => {
    if (!workspaceSlug) {
      toast.message('请先在 Agent 模式下选择项目，再打开 Skill')
      return
    }
    try {
      const [skills, defaultSlugs, skillsDir] = await Promise.all([
        window.electronAPI.getWorkspaceSkills(workspaceSlug),
        window.electronAPI.getDefaultSkillSlugs(),
        window.electronAPI.getWorkspaceSkillsDir(workspaceSlug),
      ])
      const skill = skills.find((item) => item.slug === slug)
      if (!skill) {
        toast.message(`当前项目未找到 Skill：${slug}`)
        return
      }
      setSkillDetail({ skill, isBuiltin: defaultSlugs.includes(slug), skillsDir })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法打开 Skill 详情')
    }
  }, [workspaceSlug])

  const activateReference = React.useCallback((reference: VaultReferenceRange): void => {
    if (reference.type === 'session') {
      const session = sessions.find((item) => item.id === reference.id)
      openSession('agent', reference.id, session?.title ?? reference.label)
      return
    }
    if (reference.type === 'skill') {
      // Keep the current note open and reveal the Skill editor beside it.
      void openSkillDetail(reference.id)
      return
    }
    if (reference.type === 'todo' || reference.type === 'calendar_event') {
      setPlanningTab(reference.type === 'todo' ? 'todos' : 'calendar')
      if (reference.type === 'todo') setSelectedTodoId(reference.id)
      else setSelectedCalendarEventId(reference.id)
      setActiveView('planning')
      return
    }
    setSkillsTab('mcp')
    setActiveView('agent-skills')
  }, [openSession, openSkillDetail, sessions, setActiveView, setPlanningTab, setSelectedCalendarEventId, setSelectedTodoId, setSkillsTab])

  const openWikiLink = React.useCallback((target: string): void => {
    const relativePath = resolveVaultWikiLink(target, files)
    if (!relativePath) {
      toast.message(`未找到唯一的 ${OBSIDIAN_NAME} 笔记：${target}`)
      return
    }
    void openFile(relativePath)
  }, [files, openFile])

  const selectVaultManually = async (): Promise<void> => {
    const selected = await window.electronAPI.selectVault({ inboxPath: 'Proma Inbox', allowAgentWrites: false })
    if (!selected) return
    setConfig(selected)
    setCandidates([])
    setVaultDiscoveryComplete(true)
    setRefreshToken((value) => value + 1)
    toast.success(`已连接 ${selected.displayName}`)
  }

  const switchVault = async (): Promise<void> => {
    setVaultDiscoveryComplete(false)
    setCandidates([])
    try {
      const discovered = await window.electronAPI.listVaultCandidates()
      setCandidates(discovered)
      if (discovered.length > 0) {
        setSelectedFile(null)
        setReadResult(null)
        setConfig(null)
      } else {
        await selectVaultManually()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `无法扫描 ${OBSIDIAN_NAME}`)
    } finally {
      setVaultDiscoveryComplete(true)
    }
  }

  const connectDiscoveredVault = async (candidate: VaultCandidate): Promise<void> => {
    try {
      const selected = candidate.isPromaManaged
        ? await window.electronAPI.selectDefaultVault()
        : await window.electronAPI.authorizeDiscoveredVault(candidate.path, { inboxPath: 'Proma Inbox', allowAgentWrites: false })
      setConfig(selected)
      setRefreshToken((value) => value + 1)
      toast.success(`已连接 ${selected.displayName}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `无法连接检测到的 ${OBSIDIAN_NAME}`)
    }
  }

  const createNote = async (): Promise<void> => {
    if (!config) return
    const filename = `Untitled ${new Intl.DateTimeFormat('en-CA').format(new Date())}.md`
    const relativePath = `${config.inboxPath}/${filename}`
    try {
      const result = await window.electronAPI.createVaultFile(relativePath, '')
      if (!result.ok) return
      setRefreshToken((value) => value + 1)
      await openFile(result.relativePath)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法创建笔记')
    }
  }

  const appendPendingQuote = async (): Promise<void> => {
    if (!pendingQuote || !config) return
    const source = pendingQuote.quote
    const targetPath = quoteTarget === '__new__' ? quoteNewPath.trim() : quoteTarget
    if (!targetPath) {
      toast.error('请选择引用笔记')
      return
    }

    setQuoting(true)
    try {
      if (quoteTarget === '__new__') {
        const created = await window.electronAPI.createVaultFile(targetPath, '')
        if (!created.ok) return
      }
      const current = await window.electronAPI.readVaultFile(targetPath)
      const params = new URLSearchParams()
      if (source.messageId) params.set('messageId', source.messageId)
      if (source.turn != null) params.set('turn', String(source.turn))
      if (source.selectionStart != null) params.set('start', String(source.selectionStart))
      if (source.selectionEnd != null) params.set('end', String(source.selectionEnd))
      const result = await window.electronAPI.appendVaultSource({
        relativePath: current.relativePath,
        expectedSha256: current.sha256,
        source: {
          type: 'agent-history',
          label: source.sourceLabel ?? 'Agent 历史引用',
          content: source.text,
          sourceUri: `proma://session/${pendingQuote.sessionId}${params.size > 0 ? `?${params.toString()}` : ''}`,
          capturedAt: source.capturedAt,
        },
      })
      if (!result.ok) {
        toast.error('目标笔记已在外部修改，请重新选择')
        return
      }
      setPendingQuote(null)
      setQuoteDialogOpen(false)
      setRefreshToken((value) => value + 1)
      await openFile(result.relativePath)
      toast.success(`已引用到 ${OBSIDIAN_NAME}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '写入引用失败')
    } finally {
      setQuoting(false)
    }
  }

  const save = async (content: string): Promise<void> => {
    if (!readResult) return
    try {
      const result = await window.electronAPI.writeVaultFile({
        relativePath: readResult.relativePath,
        content,
        expectedSha256: readResult.sha256,
      })
      if (!result.ok) {
        toast.error('文件已在外部修改，请重新打开后再保存')
        return
      }
      // Preserve the live editor instance: update the known write result rather
      // than rereading/rekeying the document through the global refresh path.
      setReadResult({
        relativePath: result.relativePath,
        content,
        sha256: result.sha256,
        modifiedAt: result.modifiedAt,
      })
      setFiles(await window.electronAPI.listVaultFiles())
      toast.success(`已保存到 ${OBSIDIAN_NAME}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    }
  }

  const rename = async (name: string): Promise<void> => {
    if (!readResult) return
    try {
      const renamed = await window.electronAPI.renameVaultFile({
        relativePath: readResult.relativePath,
        name,
        expectedSha256: readResult.sha256,
      })
      setSelectedFile(renamed.relativePath)
      setReadResult(renamed)
      setRefreshToken((value) => value + 1)
      toast.success('已重命名笔记')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法重命名笔记')
    }
  }

  const deleteNote = async (): Promise<void> => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const deletingCurrentFile = selectedFileRef.current === deleteTarget.relativePath
      const expectedSha256 = deletingCurrentFile && readResult?.relativePath === deleteTarget.relativePath
        ? readResult.sha256
        : undefined
      await window.electronAPI.deleteVaultFile({
        relativePath: deleteTarget.relativePath,
        expectedSha256,
      })

      if (deletingCurrentFile) {
        ++readRequestRef.current
        selectedFileRef.current = null
        setSelectedFile(null)
        setReadResult(null)
        setFileLoading(false)
        if (sessionId) await window.electronAPI.setVaultUserContext(sessionId, null, true)
      }
      setDeleteTarget(null)
      setRefreshToken((value) => value + 1)
      toast.success('已删除 Vault 笔记')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法删除笔记')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
  }

  if (!config) {
    return (
      <main className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm">
            <ObsidianIcon size={22} />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-foreground">连接 {OBSIDIAN_NAME}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Proma 只保存你授权的 {OBSIDIAN_NAME} 路径。笔记正文始终保留在自己的 Markdown 文件中。</p>
          {!vaultDiscoveryComplete ? (
            <div className="mt-6 flex justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : candidates.length > 0 ? (
            <div className="mt-7 text-left">
              <p className="mb-2 text-xs font-medium text-muted-foreground">检测到 {OBSIDIAN_NAME}</p>
              <div className="space-y-1">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.path}
                    type="button"
                    onClick={() => { void connectDiscoveredVault(candidate) }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <ObsidianIcon size={15} className="shrink-0 text-primary" />
                    <span className="truncate">{candidate.displayName}</span>
                    {candidate.isPromaManaged && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{PROMA_MANAGED_VAULT_LABEL}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Button className="mt-6 gap-2" onClick={() => { void selectVaultManually() }}>
              <FolderOpen size={16} />
              选择 {OBSIDIAN_NAME} 文件夹
            </Button>
          )}
        </div>
      </main>
    )
  }

  return (
    <>
      <main className={cn('flex h-full min-h-0 flex-col bg-muted/25', embedded && 'bg-content-area')}>
        {!embedded && <div className="relative z-10 h-[100px] shrink-0 border-b border-border/60 bg-muted/25" />}
        <div className="relative flex min-h-0 flex-1">
          {vaultSidebarLayout.renderExpandButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`展开 ${OBSIDIAN_NAME} 文件树`}
                  onClick={() => setVaultSidebarCollapsed(false)}
                  className="titlebar-no-drag absolute left-2 top-2 z-20 flex size-7 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                >
                  <PanelLeftOpen size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">展开 {OBSIDIAN_NAME} 文件树</TooltipContent>
            </Tooltip>
          )}
          {vaultSidebarLayout.renderSidebar && (
            <aside className={cn('flex shrink-0 flex-col bg-muted/25 shadow-[1px_0_0_hsl(var(--border)/0.45)]', vaultSidebarLayout.widthClass)}>
              <header className={cn('flex h-14 items-center gap-2 px-3', embedded ? 'titlebar-no-drag' : 'titlebar-drag-region')}>
                <ObsidianIcon size={17} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{config.displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{files.length} 篇 Markdown 笔记</p>
                </div>
                <div className="flex items-center gap-0.5 titlebar-no-drag">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={`折叠 ${OBSIDIAN_NAME} 文件树`} onClick={() => setVaultSidebarCollapsed(true)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <PanelLeftClose size={15} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>折叠 {OBSIDIAN_NAME} 文件树</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="新建笔记" onClick={() => { void createNote() }} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Plus size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>新建笔记</TooltipContent>
                  </Tooltip>
                </div>
              </header>
              <VaultFileList
                files={files}
                selectedPath={selectedFile}
                onSelect={(path) => { void openFile(path) }}
                onDelete={setDeleteTarget}
              />
              <div className="titlebar-no-drag flex shrink-0 items-center gap-1 border-t border-border/50 px-2 py-2">
                <button
                  type="button"
                  onClick={() => { void switchVault() }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FolderOpen size={14} className="shrink-0" />
                  <span className="truncate">切换 {OBSIDIAN_NAME}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`刷新 ${OBSIDIAN_NAME}`} onClick={() => { void refresh({ showLoading: true }) }} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <RefreshCw size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>刷新 {OBSIDIAN_NAME}</TooltipContent>
                </Tooltip>
              </div>
            </aside>
          )}
          <VaultMarkdownPane
            readResult={readResult}
            files={files}
            loading={fileLoading}
            workspaceSlug={workspaceSlug}
            onSave={save}
            onRename={rename}
            onOpenWikiLink={openWikiLink}
            onActivateReference={activateReference}
            onOpenTutorial={() => setVaultHelpOpen(true)}
          />
        </div>
      </main>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="删除 Vault 笔记？"
        description={deleteTarget ? `“${deleteTarget.relativePath}”将从 Vault 中永久删除，此操作无法撤销。` : undefined}
        confirmLabel="删除"
        loadingLabel="删除中"
        loading={deleting}
        onConfirm={deleteNote}
      />
      <Dialog
        open={quoteDialogOpen}
        onOpenChange={(open) => {
          setQuoteDialogOpen(open)
          if (!open) setPendingQuote(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>引用到 {OBSIDIAN_NAME}</DialogTitle>
            <DialogDescription>将会话快照与可回跳来源写入你选择的 Markdown 笔记。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="vault-quote-target">目标笔记</label>
            <select
              id="vault-quote-target"
              value={quoteTarget}
              onChange={(event) => setQuoteTarget(event.target.value)}
              className="flex h-9 w-full rounded-md bg-background px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="__new__">新建 Inbox 笔记</option>
              {files.map((file) => <option key={file.relativePath} value={file.relativePath}>{file.relativePath}</option>)}
            </select>
            {quoteTarget === '__new__' && (
              <Input value={quoteNewPath} onChange={(event) => setQuoteNewPath(event.target.value)} aria-label="新笔记路径" placeholder={`${config.inboxPath}/Quote.md`} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQuoteDialogOpen(false); setPendingQuote(null) }}>取消</Button>
            <Button disabled={quoting} onClick={() => { void appendPendingQuote() }}>
              {quoting && <Loader2 className="mr-2 size-4 animate-spin" />}
              写入引用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={vaultHelpOpen} onOpenChange={setVaultHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>在 Proma 中使用 {OBSIDIAN_NAME}</DialogTitle>
            <DialogDescription>Proma 直接读写你已授权给 {OBSIDIAN_NAME} 的 Markdown 文件，笔记仍可在 {OBSIDIAN_NAME} 中继续使用。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <section>
              <p className="font-medium text-foreground">编辑与保存</p>
              <p>点击笔记开始编辑；按 Cmd/Ctrl + S 保存。左下角可以切换 {OBSIDIAN_NAME} 或刷新文件列表。</p>
            </section>
            <section>
              <p className="font-medium text-foreground">双向链接</p>
              <p>输入 <code className="rounded bg-muted px-1 py-0.5 text-foreground">[[笔记名]]</code>，点击链接文字可在当前 {OBSIDIAN_NAME} 中打开对应笔记。</p>
            </section>
            <section>
              <p className="font-medium text-foreground">Proma 引用</p>
              <p>在行首或空格后输入 <code className="rounded bg-muted px-1 py-0.5 text-foreground">/</code>、<code className="rounded bg-muted px-1 py-0.5 text-foreground">#</code>、<code className="rounded bg-muted px-1 py-0.5 text-foreground">&amp;</code>、<code className="rounded bg-muted px-1 py-0.5 text-foreground">~</code> 或 <code className="rounded bg-muted px-1 py-0.5 text-foreground">*</code>，会在光标旁显示建议；符号本身仍会正常写入笔记。继续输入可过滤，方向键选择，Enter 插入引用，Esc 关闭建议并保留已输入的符号。</p>
            </section>
          </div>
          <DialogFooter>
            <Button onClick={() => setVaultHelpOpen(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SkillDetailSheet
        skill={skillDetail?.skill ?? null}
        workspaceSlug={workspaceSlug ?? ''}
        isBuiltin={skillDetail?.isBuiltin ?? false}
        updating={skillUpdating}
        onOpenChange={(open) => { if (!open) setSkillDetail(null) }}
        onToggle={(enabled) => {
          const slug = skillDetail?.skill.slug
          if (!slug || !workspaceSlug) return
          void window.electronAPI.toggleWorkspaceSkill(workspaceSlug, slug, enabled)
            .then(() => {
              setSkillDetail((current) => current ? { ...current, skill: { ...current.skill, enabled } } : current)
              bumpCapabilities((version) => version + 1)
            })
            .catch(() => toast.error('切换 Skill 状态失败'))
        }}
        onUpdate={() => {
          const slug = skillDetail?.skill.slug
          if (!slug || !workspaceSlug || skillUpdating) return
          setSkillUpdating(true)
          void window.electronAPI.updateSkillFromSource(workspaceSlug, slug)
            .then((updated) => {
              setSkillDetail((current) => current ? { ...current, skill: updated } : current)
              bumpCapabilities((version) => version + 1)
              toast.success(`已同步更新 Skill：${updated.name}`)
            })
            .catch((error) => toast.error(error instanceof Error ? error.message : '更新 Skill 失败'))
            .finally(() => setSkillUpdating(false))
        }}
        onRequestDelete={() => {
          setSkillDetail(null)
          setSkillsTab('skills')
          setActiveView('agent-skills')
          toast.message('请在技能中心确认删除 Skill')
        }}
        onOpenFolder={() => {
          if (skillDetail?.skillsDir) window.electronAPI.openFile(`${skillDetail.skillsDir}/${skillDetail.skill.slug}`)
        }}
        onChanged={() => bumpCapabilities((version) => version + 1)}
      />
    </>
  )
}
