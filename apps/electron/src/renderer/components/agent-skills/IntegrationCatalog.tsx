import * as React from 'react'
import { ArrowUpRight, ChartCandlestick, Check, CircleDashed, Cloud, FileText, Mail, Orbit, Plane, Plus, Search, Terminal, TrendingUp } from 'lucide-react'
import tongdaxinIcon from '@/assets/integrations/tongdaxin.png'
import qqMailIcon from '@/assets/integrations/qq-mail.png'
import tencentDocsIcon from '@/assets/integrations/tencent-docs.png'
import tencentMeetingIcon from '@/assets/integrations/tencent-meeting.png'
import wecomIcon from '@/assets/integrations/wecom.png'
import dingtalkIcon from '@/assets/integrations/dingtalk.png'
import qichachaIcon from '@/assets/integrations/qichacha.png'
import ctripIcon from '@/assets/integrations/ctrip.png'
import neteaseMailIcon from '@/assets/integrations/netease-mail.png'
import baiduNetdiskIcon from '@/assets/integrations/baidu-netdisk.png'
import { cn } from '@/lib/utils'
import type { CatalogCliIntegration, CatalogCredentialIntegration, CatalogGuidedIntegration, CatalogMcpIntegration } from './integration-catalog'

interface IntegrationCatalogProps {
  mcps: CatalogMcpIntegration[]
  clis: CatalogCliIntegration[]
  guided: CatalogGuidedIntegration[]
  credentials: CatalogCredentialIntegration[]
  installedMcpNames: Set<string>
  enabledMcpNames: Set<string>
  installingMcpId: string | null
  onInstallMcp: (integration: CatalogMcpIntegration) => void
  onOpenCli: (integration: CatalogCliIntegration) => void
  onGuide: (integration: CatalogGuidedIntegration) => void
  onRequestCredential: (integration: CatalogCredentialIntegration) => void
}

type CatalogCard =
  | { integration: CatalogMcpIntegration; status: string; statusTone: 'success' | 'muted'; actionLabel: string; installed: boolean; commandLine: false; onAction: () => void }
  | { integration: CatalogCliIntegration; status: string; statusTone: 'success' | 'muted'; actionLabel: string; installed: false; commandLine: true; onAction: () => void }
  | { integration: CatalogGuidedIntegration; status: string; statusTone: 'success' | 'muted'; actionLabel: string; installed: false; commandLine: false; onAction: () => void }
  | { integration: CatalogCredentialIntegration; status: string; statusTone: 'success' | 'muted'; actionLabel: string; installed: boolean; commandLine: false; onAction: () => void }

export function IntegrationCatalog({ mcps, clis, guided, credentials, installedMcpNames, enabledMcpNames, installingMcpId, onInstallMcp, onOpenCli, onGuide, onRequestCredential }: IntegrationCatalogProps): React.ReactElement {
  const cards: CatalogCard[] = [
    ...mcps.map((integration) => {
      const configured = installedMcpNames.has(integration.serverName)
      const enabled = enabledMcpNames.has(integration.serverName)
      return {
        integration,
        status: enabled ? '已连接' : configured ? '未启用' : integration.authentication === 'none' ? '可直接连接' : '需要授权',
        statusTone: enabled ? 'success' as const : 'muted' as const,
        actionLabel: configured ? `打开 ${integration.name} 配置` : `连接 ${integration.name}`,
        installed: configured,
        commandLine: false as const,
        onAction: () => onInstallMcp(integration),
      }
    }),
    ...guided.map((integration) => ({
      integration,
      status: integration.authType === 'api-key' ? '需要 API Key' : '需要配置',
      statusTone: 'muted' as const,
      actionLabel: `开始配置 ${integration.name}`,
      installed: false as const,
      commandLine: false as const,
      onAction: () => onGuide(integration),
    })),
    ...credentials.map((integration) => {
      const configured = installedMcpNames.has(integration.serverName)
      const enabled = enabledMcpNames.has(integration.serverName)
      return {
        integration,
        status: enabled ? '已连接' : configured ? '未启用' : '需要 Token',
        statusTone: enabled ? 'success' as const : 'muted' as const,
        actionLabel: configured ? `更新 ${integration.name} Token` : `连接 ${integration.name}`,
        installed: configured,
        commandLine: false as const,
        onAction: () => onRequestCredential(integration),
      }
    }),
    ...clis.map((integration) => ({
      integration,
      status: '需要安装',
      statusTone: 'muted' as const,
      actionLabel: `安装 ${integration.name}`,
      installed: false as const,
      commandLine: true as const,
      onAction: () => onOpenCli(integration),
    })),
  ]

  if (cards.length === 0) return <></>

  return (
    <section className="flex flex-col gap-4">
      <div className="px-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-foreground">连接</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground/45">{cards.length}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">选择服务后按提示完成授权、安装或配置。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <IntegrationCard
            key={card.integration.id}
            name={card.integration.name}
            description={card.integration.description}
            capabilities={card.integration.capabilities}
            iconSlug={card.integration.iconSlug}
            status={card.status}
            statusTone={card.statusTone}
            actionLabel={card.actionLabel}
            installing={'serverName' in card.integration && installingMcpId === card.integration.id}
            installed={card.installed}
            commandLine={card.commandLine}
            onAction={card.onAction}
          />
        ))}
      </div>
    </section>
  )
}

interface IntegrationCardProps {
  name: string
  description: string
  capabilities: string[]
  iconSlug: string
  status: string
  statusTone: 'success' | 'muted'
  actionLabel: string
  installing: boolean
  installed: boolean
  commandLine: boolean
  onAction: () => void
}

function IntegrationCard({ name, description, capabilities, iconSlug, status, statusTone, actionLabel, installing, installed, commandLine, onAction }: IntegrationCardProps): React.ReactElement {
  const [iconFailed, setIconFailed] = React.useState(false)
  const DomainIcon = {
    'lucide-orbit': Orbit,
    'lucide-plane': Plane,
    'lucide-chart-candlestick': ChartCandlestick,
    'lucide-trending-up': TrendingUp,
    'lucide-cloud': Cloud,
    'lucide-file-text': FileText,
    'lucide-mail': Mail,
    'lucide-search': Search,
  }[iconSlug]

  const localIcon = {
    'asset:tongdaxin': tongdaxinIcon,
    'asset:qq-mail': qqMailIcon,
    'asset:tencent-docs': tencentDocsIcon,
    'asset:tencent-meeting': tencentMeetingIcon,
    'asset:wecom': wecomIcon,
    'asset:dingtalk': dingtalkIcon,
    'asset:qichacha': qichachaIcon,
    'asset:ctrip': ctripIcon,
    'asset:netease-mail': neteaseMailIcon,
    'asset:baidu-netdisk': baiduNetdiskIcon,
  }[iconSlug]

  return (
    <article className="group flex min-h-[188px] flex-col rounded-lg bg-card p-4 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/80">
          {localIcon
            ? <img className="size-11 rounded-lg object-contain" src={localIcon} alt="" />
            : DomainIcon
              ? <DomainIcon size={25} strokeWidth={1.8} className="text-foreground/70" />
              : iconFailed
                ? commandLine
                  ? <Terminal size={21} className="text-muted-foreground" />
                  : <CircleDashed size={21} className="text-muted-foreground" />
                : <img className="size-6 object-contain" src={`https://cdn.simpleicons.org/${iconSlug}`} alt="" onError={() => setIconFailed(true)} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground">{name}</h3>
          <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {capabilities.map((capability) => (
          <span key={capability} className="rounded-md bg-foreground/[0.045] px-2 py-1 text-[11px] text-foreground/60">{capability}</span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium', statusTone === 'success' ? 'text-primary' : 'text-muted-foreground')}>
          {statusTone === 'success' && <Check size={13} />}
          <span className="truncate">{status}</span>
        </span>
        <button type="button" title={actionLabel} aria-label={actionLabel} disabled={installing} onClick={onAction} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/65 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-60">
          {installing ? <CircleDashed size={17} className="animate-spin" /> : installed || commandLine ? <ArrowUpRight size={17} /> : <Plus size={17} />}
        </button>
      </div>
    </article>
  )
}
