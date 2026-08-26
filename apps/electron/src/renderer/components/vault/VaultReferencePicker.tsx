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
import { createLatestDebouncedRequest } from './vault-reference-query'

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

const workspaceCapabilitiesRequests = new Map<string, ReturnType<typeof window.electronAPI.getWorkspaceCapabilities>>()
let emptySessionChoicesRequest: Promise<VaultReferenceChoice[]> | null = null
type PlanningReferenceItem = ReturnType<typeof buildPlanningReferenceItems>[number]
let planningReferenceItemsRequest: Promise<PlanningReferenceItem[]> | null = null

function loadWorkspaceCapabilities(workspaceSlug: string): ReturnType<typeof window.electronAPI.getWorkspaceCapabilities> {
  const existing = workspaceCapabilitiesRequests.get(workspaceSlug)
  if (existing) return existing
  const request = window.electronAPI.getWorkspaceCapabilities(workspaceSlug)
  workspaceCapabilitiesRequests.set(workspaceSlug, request)
  void request.catch(() => {
    if (workspaceCapabilitiesRequests.get(workspaceSlug) === request) workspaceCapabilitiesRequests.delete(workspaceSlug)
  })
  return request
}

async function loadPlanningReferenceItems(): Promise<PlanningReferenceItem[]> {
  if (planningReferenceItemsRequest) return planningReferenceItemsRequest
  const { from, toExclusive } = getPlanningReferenceRange()
  const request = Promise.all([
    window.electronAPI.listTodos({ status: 'open', limit: 100 }),
    window.electronAPI.listCalendarEvents({ from, to: toExclusive, limit: 100 }),
  ]).then(([todos, events]) => buildPlanningReferenceItems(todos, events))
  planningReferenceItemsRequest = request
  void request.then(
    () => { if (planningReferenceItemsRequest === request) planningReferenceItemsRequest = null },
    () => { if (planningReferenceItemsRequest === request) planningReferenceItemsRequest = null },
  )
  return request
}

async function loadSessionChoices(query: string): Promise<VaultReferenceChoice[]> {
  if (!query && emptySessionChoicesRequest) return emptySessionChoicesRequest
  const request = window.electronAPI.searchAgentSessionReferences({ query, limit: query ? 20 : 100 })
    .then((results: AgentSessionReferenceSearchResult[]) => results.map((session) => ({
      reference: { type: 'session' as const, id: session.sessionId, label: session.title },
      description: session.workspaceName ?? session.workspaceSlug ?? 'Proma 会话',
    })))
  if (!query) {
    emptySessionChoicesRequest = request
    void request.catch(() => {
      if (emptySessionChoicesRequest === request) emptySessionChoicesRequest = null
    })
  }
  return request
}

export async function loadVaultReferenceChoices(type: VaultReferenceType | 'all', query: string, workspaceSlug: string | null): Promise<VaultReferenceChoice[]> {
  if (type === 'all') {
    const types: VaultReferenceType[] = ['session', 'skill', 'mcp', 'todo', 'calendar_event']
    const choices = await Promise.all(types.map((nextType) => loadVaultReferenceChoices(nextType, query, workspaceSlug)))
    return choices.flat()
  }

  if (type === 'session') return loadSessionChoices(query)

  if (type === 'skill' || type === 'mcp') {
    if (!workspaceSlug) return []
    const capabilities = await loadWorkspaceCapabilities(workspaceSlug)
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

  return filterPlanningReferenceItems(await loadPlanningReferenceItems(), query)
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


async function loadChoices([type, query, workspaceSlug]: readonly [VaultReferenceType, string, string | null]): Promise<VaultReferenceChoice[]> {
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
  const requestRef = React.useRef(createLatestDebouncedRequest(loadChoices))

  React.useEffect(() => {
    if (!open) return
    setType(initialReference?.type ?? initialType)
    setQuery(initialReference?.label ?? '')
  }, [initialReference, initialType, open])

  React.useEffect(() => {
    if (!open) {
      requestRef.current.cancel()
      return
    }
    setLoading(true)
    requestRef.current.request(
      [type, query, workspaceSlug] as const,
      (nextChoices) => {
        setChoices(nextChoices)
        setLoading(false)
      },
      () => {
        setChoices([])
        setLoading(false)
      },
    )
    return () => requestRef.current.cancel()
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
