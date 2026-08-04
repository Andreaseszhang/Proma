/**
 * ImportSkillDialog — 从其他工作区批量导入 Skill
 *
 * 列出其他工作区可用的 Skill（自动过滤已安装的同名项），
 * 勾选多个后一键批量导入到当前项目。导入完成后展示 成功/跳过/失败 汇总与逐条原因。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsCard } from '@/components/settings/primitives'
import { cn } from '@/lib/utils'
import type { OtherWorkspaceSkillsGroup, SkillMeta } from '@proma/shared'

interface ImportSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: SkillMeta[]
  onImported: () => void
}

export function ImportSkillDialog({
  open,
  onOpenChange,
  workspaceSlug,
  installedSkills,
  onImported,
}: ImportSkillDialogProps): React.ReactElement {
  const [otherWorkspaces, setOtherWorkspaces] = React.useState<OtherWorkspaceSkillsGroup[]>([])
  const [selectedWorkspaceSlug, setSelectedWorkspaceSlug] = React.useState('')
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set())
  const [importing, setImporting] = React.useState(false)

  React.useEffect(() => {
    if (!open || !workspaceSlug) return
    // 打开时清空上一次的选中
    setSelectedWorkspaceSlug('')
    setSelectedKeys(new Set())
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

  // 来源项目下拉默认选中第一个可用工作区（保持当前值仍有效时不切换）
  React.useEffect(() => {
    if (!open || availableWorkspaces.length === 0) {
      setSelectedWorkspaceSlug('')
      return
    }
    setSelectedWorkspaceSlug((current) =>
      availableWorkspaces.some((w) => w.workspaceSlug === current)
        ? current
        : availableWorkspaces[0]!.workspaceSlug,
    )
  }, [availableWorkspaces, open])

  const selectedWorkspace = React.useMemo(
    () => availableWorkspaces.find((w) => w.workspaceSlug === selectedWorkspaceSlug) ?? null,
    [availableWorkspaces, selectedWorkspaceSlug],
  )

  const selectedCount = React.useMemo(() => {
    if (!selectedWorkspace) return 0
    return selectedWorkspace.skills.filter((s) =>
      selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${s.slug}`),
    ).length
  }, [selectedWorkspace, selectedKeys])

  const toggleSelection = (sourceSlug: string, skillSlug: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      const key = `${sourceSlug}/${skillSlug}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleWorkspaceChange = (value: string): void => {
    setSelectedWorkspaceSlug(value)
    setSelectedKeys(new Set())
  }

  const handleImport = async (): Promise<void> => {
    if (!workspaceSlug || importing || !selectedWorkspace || selectedCount === 0) return
    const selections = selectedWorkspace.skills
      .filter((s) => selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${s.slug}`))
      .map((s) => ({ sourceSlug: selectedWorkspace.workspaceSlug, skillSlug: s.slug }))
    setImporting(true)
    try {
      const importResult = await window.electronAPI.batchImportSkillsFromWorkspaces(workspaceSlug, selections)
      if (importResult.imported > 0) {
        onImported()
        const detail =
          importResult.skipped > 0 && importResult.failed > 0
            ? `（跳过 ${importResult.skipped} 个、失败 ${importResult.failed} 个）`
            : importResult.skipped > 0
              ? `（跳过 ${importResult.skipped} 个）`
              : importResult.failed > 0
                ? `（失败 ${importResult.failed} 个）`
                : ''
        toast.success(`已导入 ${importResult.imported} 个 Skill${detail}`)
        onOpenChange(false)
      } else if (importResult.failed === 0) {
        toast.info(`没有新导入的 Skill，已跳过 ${importResult.skipped} 个同名项`)
      } else {
        toast.error(`导入失败 ${importResult.failed} 个${importResult.skipped > 0 ? `，跳过 ${importResult.skipped} 个` : ''}`)
      }
    } catch (error) {
      console.error('[Agent 技能] 批量导入失败:', error)
      toast.error('批量导入失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle>从其他项目批量导入 Skill</DialogTitle>
          <DialogDescription>
            从其他项目勾选多个 Skill 导入到当前项目。已安装的同名 Skill 会自动过滤。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
          {availableWorkspaces.length === 0 ? (
            <SettingsCard divided={false}>
              <div className="py-10 text-center text-sm text-muted-foreground">
                没有可导入的 Skill。其他项目暂无 Skill，或者它们都已经安装到当前项目了。
              </div>
            </SettingsCard>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">选择来源项目</div>
              <Select value={selectedWorkspaceSlug} onValueChange={handleWorkspaceChange}>
                <SelectTrigger>
                  <SelectValue placeholder="选择来源项目" />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((w) => (
                    <SelectItem key={w.workspaceSlug} value={w.workspaceSlug}>
                      {w.workspaceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedWorkspace ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="truncate">{selectedWorkspace.workspaceName}</span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                  {selectedWorkspace.skills.length} 个
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedWorkspace.skills.map((skill) => {
                  const checked = selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${skill.slug}`)
                  return (
                    <SettingsCard key={skill.slug} divided={false} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSelection(selectedWorkspace.workspaceSlug, skill.slug)}
                        className={cn(
                          'flex h-full w-full flex-col gap-3 p-4 text-left transition-colors',
                          checked ? 'bg-accent/40' : 'hover:bg-accent/30',
                        )}
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
            </>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4">
          <span className="text-xs text-muted-foreground">
            勾选要导入的 Skill，已安装的同名 Skill 会自动过滤
          </span>
          <Button size="sm" onClick={() => void handleImport()} disabled={importing || selectedCount === 0}>
            {importing ? <Loader2 size={13} className="animate-spin" /> : null}
            {importing ? '导入中...' : `一键导入所选（${selectedCount}）`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
