import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { BookOpen, ChevronDown, ChevronRight, Folder, FolderOpen, Link2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { VaultCandidate, VaultFileEntry, VaultReadResult, VaultSummary } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VaultLiveMarkdownEditor, type VaultLiveMarkdownEditorHandle } from './VaultLiveMarkdownEditor'
import { VaultReferencePicker } from './VaultReferencePicker'
import {
  selectedVaultFileAtom,
  vaultReadResultAtom,
  vaultRefreshTokenAtom,
  pendingVaultQuoteAtom,
} from '@/atoms/vault-atoms'
import { cn } from '@/lib/utils'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import {
  resolveVaultWikiLink,
  serializeVaultReference,
  type VaultReference,
  type VaultReferenceRange,
  type VaultReferenceType,
} from './vault-reference-utils'

function displayDocumentTitle(filename: string): string {
  return filename.replace(/\.md$/i, '')
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
}: {
  files: VaultFileEntry[]
  selectedPath: string | null
  onSelect: (relativePath: string) => void
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
            <button
              key={file.relativePath}
              type="button"
              title={file.relativePath}
              onClick={() => onSelect(file.relativePath)}
              className={cn(
                'flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-[13px] transition-colors',
                selected ? 'bg-accent text-accent-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted/70 hover:text-foreground',
              )}
              style={{ paddingLeft: `${18 + Math.min(depth, 6) * 14}px` }}
            >
              <span className="min-w-0 truncate">{displayDocumentTitle(file.name)}</span>
            </button>
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
}: {
  readResult: VaultReadResult
  files: VaultFileEntry[]
  workspaceSlug: string | null
  onSave: (nextContent: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onOpenWikiLink: (target: string) => void
}): React.ReactElement {
  const [draft, setDraft] = React.useState(readResult.content)
  const [saving, setSaving] = React.useState(false)
  const [filename, setFilename] = React.useState(displayDocumentTitle(readResult.relativePath.split('/').pop() ?? readResult.relativePath))
  const [referencePicker, setReferencePicker] = React.useState<{ reference?: VaultReference; range?: VaultReferenceRange; type?: VaultReferenceType } | null>(null)
  const editorPageRef = React.useRef<HTMLDivElement>(null)
  const editorRef = React.useRef<VaultLiveMarkdownEditorHandle>(null)

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
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-5">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="插入 Proma 引用"
                onClick={() => setReferencePicker({})}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Link2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>插入 Proma 引用</TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1">
          <VaultLiveMarkdownEditor
            ref={editorRef}
            value={draft}
            files={files}
            onChange={setDraft}
            onSave={() => { void save() }}
            onOpenWikiLink={onOpenWikiLink}
            onRequestReference={(type) => setReferencePicker({ type })}
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
}: {
  readResult: VaultReadResult | null
  files: VaultFileEntry[]
  loading: boolean
  workspaceSlug: string | null
  onSave: (nextContent: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onOpenWikiLink: (target: string) => void
}): React.ReactElement {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!readResult) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 px-12 text-left">
        <BookOpen className="size-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">从左侧选择一篇笔记</p>
      </div>
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-muted/25">
      <VaultMarkdownEditor
        key={`${readResult.relativePath}:${readResult.sha256}`}
        readResult={readResult}
        files={files}
        workspaceSlug={workspaceSlug}
        onSave={onSave}
        onRename={onRename}
        onOpenWikiLink={onOpenWikiLink}
      />
    </section>
  )
}

export function VaultView(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaceSlug = React.useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.slug ?? null,
    [currentWorkspaceId, workspaces],
  )
  const [config, setConfig] = React.useState<VaultSummary | null>(null)
  const [candidates, setCandidates] = React.useState<VaultCandidate[]>([])
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
  const selectedFileRef = React.useRef(selectedFile)
  const readRequestRef = React.useRef(0)

  React.useEffect(() => {
    selectedFileRef.current = selectedFile
  }, [selectedFile])

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const nextConfig = await window.electronAPI.getVaultConfig()
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
      toast.error(error instanceof Error ? error.message : '无法读取 Vault')
    } finally {
      setLoading(false)
    }
  }, [setReadResult, setSelectedFile])

  React.useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])

  React.useEffect(() => {
    if (!pendingQuote || !config) return
    setQuoteTarget(selectedFile ?? files[0]?.relativePath ?? '__new__')
    setQuoteNewPath(`${config.inboxPath}/Quote ${new Intl.DateTimeFormat('en-CA').format(new Date())}.md`)
    setQuoteDialogOpen(true)
  }, [config, files, pendingQuote, selectedFile])

  React.useEffect(() => {
    if (config) return
    void window.electronAPI.discoverObsidianVaults().then(setCandidates).catch(() => setCandidates([]))
  }, [config])

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

  const openWikiLink = React.useCallback((target: string): void => {
    const relativePath = resolveVaultWikiLink(target, files)
    if (!relativePath) {
      toast.message(`未找到唯一的 Vault 笔记：${target}`)
      return
    }
    void openFile(relativePath)
  }, [files, openFile])

  const connectVault = async (): Promise<void> => {
    const selected = await window.electronAPI.selectVault({ inboxPath: 'Proma Inbox', allowAgentWrites: false })
    if (!selected) return
    setConfig(selected)
    setRefreshToken((value) => value + 1)
    toast.success(`已连接 ${selected.displayName}`)
  }

  const connectDiscoveredVault = async (candidate: VaultCandidate): Promise<void> => {
    try {
      const selected = await window.electronAPI.authorizeDiscoveredVault(candidate.path, { inboxPath: 'Proma Inbox', allowAgentWrites: false })
      setConfig(selected)
      setRefreshToken((value) => value + 1)
      toast.success(`已连接 ${selected.displayName}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法连接检测到的 Vault')
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
      toast.success('已引用到 Vault')
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
      setReadResult(await window.electronAPI.readVaultFile(result.relativePath))
      setRefreshToken((value) => value + 1)
      toast.success('已保存到 Vault')
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

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
  }

  if (!config) {
    return (
      <main className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm">
            <BookOpen size={22} />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-foreground">连接你的 Vault</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Proma 只保存你授权的 Vault 路径。笔记正文始终保留在自己的 Markdown 文件中。</p>
          <Button className="mt-6 gap-2" onClick={() => { void connectVault() }}>
            <FolderOpen size={16} />
            选择 Vault 文件夹
          </Button>
          {candidates.length > 0 && (
            <div className="mt-7 text-left">
              <p className="mb-2 text-xs font-medium text-muted-foreground">检测到 Obsidian Vault</p>
              <div className="space-y-1">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.path}
                    type="button"
                    onClick={() => { void connectDiscoveredVault(candidate) }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <BookOpen size={15} className="shrink-0 text-primary" />
                    <span className="truncate">{candidate.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="flex h-full min-h-0 flex-col bg-muted/25">
        <div className="relative z-10 h-[100px] shrink-0 border-b border-border/60 bg-muted/25" />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[280px] shrink-0 flex-col bg-muted/25 shadow-[1px_0_0_hsl(var(--border)/0.45)]">
        <header className="flex h-14 items-center gap-2 px-3 titlebar-drag-region">
          <BookOpen size={17} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{config.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{files.length} 篇 Markdown 笔记</p>
          </div>
          <div className="flex items-center gap-0.5 titlebar-no-drag">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="刷新 Vault" onClick={() => { void refresh() }} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <RefreshCw size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>刷新 Vault</TooltipContent>
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
          <VaultFileList files={files} selectedPath={selectedFile} onSelect={(path) => { void openFile(path) }} />
          </aside>
          <VaultMarkdownPane
            readResult={readResult}
            files={files}
            loading={fileLoading}
            workspaceSlug={workspaceSlug}
            onSave={save}
            onRename={rename}
            onOpenWikiLink={openWikiLink}
          />
        </div>
      </main>
      <Dialog
        open={quoteDialogOpen}
        onOpenChange={(open) => {
          setQuoteDialogOpen(open)
          if (!open) setPendingQuote(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>引用到 Vault</DialogTitle>
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
    </>
  )
}
