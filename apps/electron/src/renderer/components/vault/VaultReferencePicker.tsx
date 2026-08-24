import * as React from 'react'
import type { AgentSessionReferenceSearchResult } from '@proma/shared'
import { CalendarDays, ListTodo, MessageSquareText, Server, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  buildPlanningReferenceItems,
  filterPlanningReferenceItems,
  getPlanningReferenceRange,
} from '@/components/agent/planning-reference-state'
import { cn } from '@/lib/utils'
import type { VaultReference, VaultReferenceType } from './vault-reference-utils'

interface VaultReferencePickerProps {
  open: boolean
  workspaceSlug: string | null
  initialType?: VaultReferenceType
  initialReference?: VaultReference
  onOpenChange: (open: boolean) => void
  onSelect: (reference: VaultReference) => void
}

export interface VaultReferenceChoice {
  reference: VaultReference
  description: string
}

export async function loadVaultReferenceChoices(type: VaultReferenceType | 'all', query: string, workspaceSlug: string | null): Promise<VaultReferenceChoice[]> {
  if (type === 'all') {
    const types: VaultReferenceType[] = ['session', 'skill', 'mcp', 'todo', 'calendar_event']
    const choices = await Promise.all(types.map((nextType) => loadVaultReferenceChoices(nextType, query, workspaceSlug)))
    return choices.flat()
  }

  if (type === 'session') {
    const results: AgentSessionReferenceSearchResult[] = await window.electronAPI.searchAgentSessionReferences({ query, limit: query ? 20 : 100 })
    return results.map((session) => ({
      reference: { type, id: session.sessionId, label: session.title },
      description: session.workspaceName ?? session.workspaceSlug ?? 'Proma 会话',
    }))
  }

  if (type === 'skill' || type === 'mcp') {
    if (!workspaceSlug) return []
    const capabilities = await window.electronAPI.getWorkspaceCapabilities(workspaceSlug)
    if (type === 'skill') {
      return capabilities.skills
        .filter((skill) => skill.enabled && matchesQuery(`${skill.name} ${skill.slug ?? ''}`, query))
        .map((skill) => ({
          reference: { type, id: skill.slug ?? skill.name, label: skill.name },
          description: skill.description ?? 'Proma Skill',
        }))
    }
    return capabilities.mcpServers
      .filter((server) => server.enabled && matchesQuery(server.name, query))
      .map((server) => ({
        reference: { type, id: server.name, label: server.name },
        description: server.type,
      }))
  }

  const { from, toExclusive } = getPlanningReferenceRange()
  const [todos, events] = await Promise.all([
    window.electronAPI.listTodos({ status: 'open', limit: 100 }),
    window.electronAPI.listCalendarEvents({ from, to: toExclusive, limit: 100 }),
  ])
  return filterPlanningReferenceItems(buildPlanningReferenceItems(todos, events), query)
    .filter((item) => item.referenceType === type)
    .map((item) => ({
      reference: { type, id: item.id, label: item.label },
      description: item.description,
    }))
}


const types: Array<{ type: VaultReferenceType; label: string; icon: typeof Sparkles }> = [
  { type: 'session', label: '会话', icon: MessageSquareText },
  { type: 'skill', label: 'Skill', icon: Sparkles },
  { type: 'mcp', label: 'MCP', icon: Server },
  { type: 'todo', label: '待办', icon: ListTodo },
  { type: 'calendar_event', label: '日程', icon: CalendarDays },
]

export function matchesQuery(value: string, query: string): boolean {
  return !query || value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}


async function loadChoices(type: VaultReferenceType, query: string, workspaceSlug: string | null): Promise<VaultReferenceChoice[]> {
  return loadVaultReferenceChoices(type, query, workspaceSlug)
}


export function VaultReferencePicker({
  open,
  workspaceSlug,
  initialType = 'session',
  initialReference,
  onOpenChange,
  onSelect,
}: VaultReferencePickerProps): React.ReactElement {
  const [type, setType] = React.useState<VaultReferenceType>(initialReference?.type ?? initialType)
  const [query, setQuery] = React.useState(initialReference?.label ?? '')
  const [choices, setChoices] = React.useState<VaultReferenceChoice[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setType(initialReference?.type ?? initialType)
    setQuery(initialReference?.label ?? '')
  }, [initialReference, initialType, open])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void loadChoices(type, query, workspaceSlug)
      .then((nextChoices) => {
        if (!cancelled) setChoices(nextChoices)
      })
      .catch(() => {
        if (!cancelled) setChoices([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, query, type, workspaceSlug])

  const selectType = (nextType: VaultReferenceType): void => {
    setType(nextType)
    setQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialReference ? '编辑引用' : '插入引用'}</DialogTitle>
          <DialogDescription>Markdown 保留可读名称，Proma 使用紧随其后的 metadata 恢复可编辑引用。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="引用类型">
          {types.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.type}
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={type === item.type}
                onClick={() => selectType(item.type)}
                className={cn('gap-1.5', type === item.type && 'bg-accent text-accent-foreground')}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Button>
            )
          })}
        </div>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`搜索${types.find((item) => item.type === type)?.label ?? '引用'}`}
          aria-label="搜索引用"
        />
        <div className="max-h-64 overflow-y-auto rounded-md bg-muted/40 p-1 shadow-sm">
          {loading ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">正在加载引用</p>
          ) : choices.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">没有匹配的引用</p>
          ) : choices.map((choice) => (
            <button
              key={`${choice.reference.type}:${choice.reference.id}`}
              type="button"
              onClick={() => onSelect(choice.reference)}
              className="flex w-full min-w-0 flex-col gap-0.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className="truncate text-sm font-medium text-foreground">{choice.reference.label}</span>
              <span className="truncate text-xs text-muted-foreground">{choice.description}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
