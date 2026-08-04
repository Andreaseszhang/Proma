/**
 * BulkImportSkillDialog — 批量导入 Skill 到当前工作区
 *
 * 支持两种来源：
 * 1. 本地文件夹：拖拽多个 Skill 目录（或 SKILL.md 文件）到拖放区，或通过系统多选文件夹对话框选择；
 *    可配置重复处理策略（跳过 / 覆盖），导入后展示 成功/跳过/失败 汇总与原因。
 * 2. 其他工作区：勾选多个 Skill 后一键批量导入，复用现有单 skill 导入逻辑。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Check, FolderOpen, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SettingsCard } from '@/components/settings/primitives'
import { cn } from '@/lib/utils'
import type {
  BulkImportSkillsResult,
  OtherWorkspaceSkillsGroup,
  SkillMeta,
} from '@proma/shared'

interface BulkImportSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: SkillMeta[]
  onImported: () => void
}

function basenamePath(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** 导入结果汇总（成功/跳过/失败 + 明细） */
function ImportResultSummary({ result }: { result: BulkImportSkillsResult }): React.ReactElement {
  const skipped = result.items.filter((i) => i.status === 'skipped')
  const failed = result.items.filter((i) => i.status === 'failed')

  return (
    <SettingsCard divided={false} className="overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium">
          <span className="text-emerald-600 dark:text-emerald-400">成功 {result.imported}</span>
          <span className="text-amber-600 dark:text-amber-400">跳过 {result.skipped}</span>
          <span className="text-red-600 dark:text-red-400">失败 {result.failed}</span>
        </div>
        {(skipped.length > 0 || failed.length > 0) && (
          <ul className="space-y-1.5 text-xs">
            {skipped.map((item) => (
              <li key={`skipped-${item.slug}`} className="flex items-start gap-2 text-muted-foreground">
                <span className="mt-[3px] shrink-0 text-amber-600 dark:text-amber-400">跳过</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground/80">{item.name}</span>
                  <span className="text-muted-foreground/70">（{item.slug}）</span>
                  {item.reason ? <span className="block truncate text-muted-foreground/60">{item.reason}</span> : null}
                </span>
              </li>
            ))}
            {failed.map((item) => (
              <li key={`failed-${item.slug}`} className="flex items-start gap-2 text-muted-foreground">
                <span className="mt-[3px] shrink-0 text-red-600 dark:text-red-400">失败</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground/80">{item.name}</span>
                  <span className="text-muted-foreground/70">（{item.slug}）</span>
                  {item.reason ? <span className="block truncate text-muted-foreground/60">{item.reason}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsCard>
  )
}

export function BulkImportSkillDialog({
  open,
  onOpenChange,
  workspaceSlug,
  installedSkills,
  onImported,
}: BulkImportSkillDialogProps): React.ReactElement {
  // ===== 本地文件夹导入 =====
  const [localPaths, setLocalPaths] = React.useState<string[]>([])
  const [overwrite, setOverwrite] = React.useState(false)
  const [importingLocal, setImportingLocal] = React.useState(false)
  const [localResult, setLocalResult] = React.useState<BulkImportSkillsResult | null>(null)
  const [dragOver, setDragOver] = React.useState(false)

  // ===== 其他工作区导入 =====
  const [otherWorkspaces, setOtherWorkspaces] = React.useState<OtherWorkspaceSkillsGroup[]>([])
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set())
  const [importingWorkspace, setImportingWorkspace] = React.useState(false)
  const [workspaceResult, setWorkspaceResult] = React.useState<BulkImportSkillsResult | null>(null)

  React.useEffect(() => {
    if (!open || !workspaceSlug) return
    void (async () => {
      try {
        const groups = await window.electronAPI.getOtherWorkspaceSkills(workspaceSlug)
        setOtherWorkspaces(groups)
      } catch (error) {
        console.error('[Agent 技能] 加载其他工作区 Skill 失败:', error)
      }
    })()
  }, [open, workspaceSlug])

  const installedSlugs = React.useMemo(() => new Set(installedSkills.map((s) => s.slug)), [installedSkills])

  const availableWorkspaces = React.useMemo(
    () =>
      otherWorkspaces
        .map((w) => ({ ...w, skills: w.skills.filter((s) => !installedSlugs.has(s.slug)) }))
        .filter((w) => w.skills.length > 0),
    [otherWorkspaces, installedSlugs],
  )

  const selectedCount = React.useMemo(() => {
    let count = 0
    for (const w of availableWorkspaces) {
      for (const s of w.skills) {
        if (selectedKeys.has(`${w.workspaceSlug}/${s.slug}`)) count += 1
      }
    }
    return count
  }, [availableWorkspaces, selectedKeys])

  const toggleSelection = (sourceSlug: string, skillSlug: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      const key = `${sourceSlug}/${skillSlug}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addLocalPaths = (paths: string[]): void => {
    void (async () => {
      try {
        const { directories, files } = await window.electronAPI.checkPathsType(paths)
        const validFiles = files.filter((f) => basenamePath(f).toLowerCase() === 'skill.md')
        if (files.length > validFiles.length) {
          toast.info('仅支持文件夹或 SKILL.md 文件，其余文件已忽略')
        }
        const all = [...directories, ...validFiles]
        if (all.length === 0) {
          toast.error('未识别到有效的 Skill 来源')
          return
        }
        setLocalPaths((prev) => {
          const seen = new Set(prev)
          const next = [...prev]
          for (const p of all) {
            if (!seen.has(p)) {
              seen.add(p)
              next.push(p)
            }
          }
          return next
        })
        setLocalResult(null)
      } catch (error) {
        console.error('[Agent 技能] 校验拖入路径失败:', error)
        toast.error('校验所选路径失败')
      }
    })()
  }

  const handlePickFolders = async (): Promise<void> => {
    try {
      const dirs = await window.electronAPI.pickSkillSourceDirectories()
      if (dirs.length > 0) addLocalPaths(dirs)
    } catch (error) {
      console.error('[Agent 技能] 选择 Skill 文件夹失败:', error)
      toast.error('选择文件夹失败')
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return

    const paths: string[] = []
    for (const f of droppedFiles) {
      try {
        const p = window.electronAPI.getPathForFile(f)
        if (p) paths.push(p)
      } catch {
        // 无法获取本地路径时忽略
      }
    }
    if (paths.length === 0) {
      toast.info('无法读取拖入内容的本地路径，请改用「选择文件夹」')
      return
    }
    addLocalPaths(paths)
  }

  const handleImportLocal = async (): Promise<void> => {
    if (!workspaceSlug || importingLocal || localPaths.length === 0) return
    setImportingLocal(true)
    try {
      const result = await window.electronAPI.batchImportSkillsFromPaths(workspaceSlug, localPaths, { overwrite })
      setLocalResult(result)
      if (result.imported > 0) {
        onImported()
        toast.success(`批量导入完成：成功 ${result.imported} 个、跳过 ${result.skipped} 个、失败 ${result.failed} 个`)
      } else if (result.failed === 0) {
        toast.info(`没有新导入的 Skill：跳过 ${result.skipped} 个`)
      } else {
        toast.error(`批量导入失败 ${result.failed} 个`)
      }
    } catch (error) {
      console.error('[Agent 技能] 批量导入失败:', error)
      toast.error('批量导入失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setImportingLocal(false)
    }
  }

  const handleImportWorkspace = async (): Promise<void> => {
    if (!workspaceSlug || importingWorkspace || selectedCount === 0) return
    const selections: Array<{ sourceSlug: string; skillSlug: string }> = []
    for (const w of availableWorkspaces) {
      for (const s of w.skills) {
        if (selectedKeys.has(`${w.workspaceSlug}/${s.slug}`)) {
          selections.push({ sourceSlug: w.workspaceSlug, skillSlug: s.slug })
        }
      }
    }
    setImportingWorkspace(true)
    try {
      const result = await window.electronAPI.batchImportSkillsFromWorkspaces(workspaceSlug, selections)
      setWorkspaceResult(result)
      if (result.imported > 0) {
        onImported()
        setSelectedKeys(new Set())
        toast.success(`批量导入完成：成功 ${result.imported} 个、跳过 ${result.skipped} 个、失败 ${result.failed} 个`)
      } else {
        toast.error('批量导入失败，请查看明细')
      }
    } catch (error) {
      console.error('[Agent 技能] 批量导入失败:', error)
      toast.error('批量导入失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setImportingWorkspace(false)
    }
  }

  const installedHint = React.useMemo(() => {
    const count = localPaths.filter((p) => installedSlugs.has(basenamePath(p))).length
    return count
  }, [localPaths, installedSlugs])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle>批量导入 Skill</DialogTitle>
          <DialogDescription>
            一次把多个 Skill 导入到当前项目。可拖拽多个 Skill 文件夹，或从其他项目勾选多个 Skill 批量导入。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="local" className="px-6">
          <TabsList className="w-full">
            <TabsTrigger value="local" className="flex-1">本地文件夹</TabsTrigger>
            <TabsTrigger value="workspace" className="flex-1">其他项目</TabsTrigger>
          </TabsList>

          {/* ===== 本地文件夹 ===== */}
          <TabsContent value="local">
            <div className="max-h-[52vh] space-y-4 overflow-y-auto pb-6">
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => void handlePickFolders()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void handlePickFolders()
                  }
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  dragOver ? 'border-primary/60 bg-primary/[0.04]' : 'border-border/70 hover:border-border hover:bg-foreground/[0.02]',
                )}
              >
                <Upload size={22} className="text-foreground/40" />
                <div className="text-[13px] font-medium text-foreground/80">拖拽 Skill 文件夹到这里，或点击选择</div>
                <div className="text-xs text-muted-foreground">
                  支持一次拖入多个 Skill 目录（目录内含 SKILL.md），也可直接拖入 SKILL.md 文件
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button size="sm" variant="outline" onClick={() => void handlePickFolders()}>
                  <FolderOpen size={13} />
                  选择文件夹（可多选）
                </Button>
                <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setOverwrite(false)}
                    className={cn(
                      'rounded-md px-2.5 py-1 font-medium transition-colors',
                      !overwrite ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    跳过已存在
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverwrite(true)}
                    className={cn(
                      'rounded-md px-2.5 py-1 font-medium transition-colors',
                      overwrite ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    覆盖已存在
                  </button>
                </div>
              </div>

              {localPaths.length > 0 ? (
                <SettingsCard divided={false} className="overflow-hidden">
                  <ul className="divide-y divide-border/60">
                    {localPaths.map((p) => (
                      <li key={p} className="flex items-center gap-2 px-3 py-2">
                        <FolderOpen size={14} className="shrink-0 text-foreground/40" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-foreground/85">{basenamePath(p)}</span>
                            {installedSlugs.has(basenamePath(p)) && (
                              <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                已存在
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground/70">{p}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLocalPaths((prev) => prev.filter((x) => x !== p))
                            setLocalResult(null)
                          }}
                          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="移除"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </SettingsCard>
              ) : (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-5 text-center text-xs text-muted-foreground">
                  尚未选择 Skill 源文件夹
                </div>
              )}

              {localResult ? <ImportResultSummary result={localResult} /> : null}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4">
              <span className="text-xs text-muted-foreground">
                {localPaths.length > 0
                  ? `已选择 ${localPaths.length} 个来源${installedHint > 0 ? `，其中 ${installedHint} 个与当前项目同名` : ''}`
                  : '选择或拖入 Skill 源后开始批量导入'}
              </span>
              <Button size="sm" onClick={() => void handleImportLocal()} disabled={importingLocal || localPaths.length === 0}>
                {importingLocal ? <Loader2 size={13} className="animate-spin" /> : null}
                {importingLocal ? '导入中...' : `批量导入（${localPaths.length}）`}
              </Button>
            </div>
          </TabsContent>

          {/* ===== 其他工作区 ===== */}
          <TabsContent value="workspace">
            <div className="max-h-[52vh] space-y-4 overflow-y-auto pb-6">
              {availableWorkspaces.length === 0 ? (
                <SettingsCard divided={false}>
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    没有可导入的 Skill。其他项目暂无 Skill，或者它们都已经安装到当前项目了。
                  </div>
                </SettingsCard>
              ) : (
                availableWorkspaces.map((w) => (
                  <div key={w.workspaceSlug}>
                    <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <span className="truncate">{w.workspaceName}</span>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                        {w.skills.length} 个
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {w.skills.map((skill) => {
                        const checked = selectedKeys.has(`${w.workspaceSlug}/${skill.slug}`)
                        return (
                          <SettingsCard key={skill.slug} divided={false} className="overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleSelection(w.workspaceSlug, skill.slug)}
                              className="flex h-full w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-accent/40"
                            >
                              <div className="flex items-start gap-3">
                                <span
                                  className={cn(
                                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                                    checked
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border/80 text-transparent',
                                  )}
                                >
                                  <Check size={13} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">{skill.name}</span>
                                    {skill.version ? (
                                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                        v{skill.version}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">{skill.slug}</div>
                                </div>
                                <Sparkles size={16} className="shrink-0 text-amber-500" />
                              </div>
                              <div className="line-clamp-3 min-h-[40px] text-sm leading-6 text-muted-foreground">
                                {skill.description ?? '暂无描述'}
                              </div>
                            </button>
                          </SettingsCard>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}

              {workspaceResult ? <ImportResultSummary result={workspaceResult} /> : null}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4">
              <span className="text-xs text-muted-foreground">
                勾选要导入的 Skill，已安装的同名 Skill 会自动过滤
              </span>
              <Button
                size="sm"
                onClick={() => void handleImportWorkspace()}
                disabled={importingWorkspace || selectedCount === 0}
              >
                {importingWorkspace ? <Loader2 size={13} className="animate-spin" /> : null}
                {importingWorkspace ? '导入中...' : `批量导入所选（${selectedCount}）`}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
