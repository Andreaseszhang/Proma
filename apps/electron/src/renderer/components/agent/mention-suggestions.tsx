/**
 * MentionSuggestions — Skill / MCP 的 TipTap Mention Suggestion 统一配置
 *
 * 泛型工厂 createMentionSuggestion 封装公共逻辑（渲染、定位、键盘导航），
 * 通过 MentionSuggestionConfig 注入差异部分（触发字符、数据获取、行渲染）。
 */

import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { MessageSquareText, Sparkles, Server } from 'lucide-react'
import { MentionList } from './MentionList'
import type { MentionListRef } from './MentionList'
import { createMentionPopup, positionPopup } from './mention-popup-utils'
import type { AgentSessionReferenceSearchResult } from '@proma/shared'

// ===== 泛型工厂 =====

interface MentionSuggestionConfig<T> {
  /** 触发字符 */
  char: string
  /** 空列表占位文字 */
  emptyText: string
  /** 异步获取列表项 */
  fetchItems: (slug: string, query: string) => Promise<T[]>
  /** 提取唯一 key */
  keyExtractor: (item: T) => string
  /** 渲染列表项 */
  renderItem: (item: T) => React.ReactNode
  /** 选中后传给 command 的 id 和 label */
  toCommand: (item: T) => { id: string; label: string }
  /**
   * 可选：根据当前 items 和 query 决定是否隐藏 popup。
   * 返回 true 时 popup 仅 display:none，不销毁；query 变化后会重新评估，可恢复显示。
   * 同时 mentionActiveRef/mentionItemCountRef 会被置 0，避免 Enter 键被 Mention 拦截。
   */
  shouldHidePopup?: (items: T[], query: string) => boolean
}

function createMentionSuggestion<T>(
  config: MentionSuggestionConfig<T>,
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
): Omit<SuggestionOptions<T>, 'editor'> {
  return {
    char: config.char,
    allowSpaces: false,
    allowedPrefixes: null,

    items: async ({ query }): Promise<T[]> => {
      const slug = workspaceSlugRef.current
      if (!slug) return []
      try {
        return await config.fetchItems(slug, (query ?? '').toLowerCase())
      } catch {
        return []
      }
    },

    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null
      let popup: HTMLDivElement | null = null
      let blurHandler: (() => void) | null = null
      let editorDom: HTMLElement | null = null

      function cleanup() {
        if (blurHandler && editorDom) {
          editorDom.removeEventListener('blur', blurHandler, true)
          blurHandler = null
        }
        editorDom = null
        mentionActiveRef.current = false
        mentionItemCountRef.current = 0
        popup?.remove()
        popup = null
        renderer?.destroy()
        renderer = null
      }

      // 根据 shouldHidePopup 切换 popup 可见性，不销毁；同步 active/count ref 让 Enter 键路由正确
      function applyVisibility(items: T[], query: string) {
        if (!popup) return
        const hide = config.shouldHidePopup?.(items, query) ?? false
        if (hide) {
          popup.style.display = 'none'
          mentionActiveRef.current = false
          mentionItemCountRef.current = 0
        } else {
          popup.style.display = ''
          mentionActiveRef.current = true
          mentionItemCountRef.current = items.length
        }
      }

      return {
        onStart(props) {
          if (popup || renderer) {
            cleanup()
          }

          editorDom = props.editor.view.dom
          renderer = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              emptyText: config.emptyText,
              keyExtractor: config.keyExtractor,
              renderItem: config.renderItem,
              onSelect: (item: T) => {
                const cmd = config.toCommand(item)
                props.command({ id: cmd.id, label: cmd.label })
              },
            },
            editor: props.editor,
          })
          popup = createMentionPopup(renderer.element)
          positionPopup(popup, props.clientRect?.())
          applyVisibility(props.items, props.query ?? '')

          blurHandler = () => {
            setTimeout(() => {
              if (!props.editor.view.hasFocus() && popup) {
                cleanup()
              }
            }, 100)
          }
          editorDom.addEventListener('blur', blurHandler, true)
        },

        onUpdate(props) {
          renderer?.updateProps({
            items: props.items,
            onSelect: (item: T) => {
              const cmd = config.toCommand(item)
              props.command({ id: cmd.id, label: cmd.label })
            },
          })
          positionPopup(popup, props.clientRect?.())
          applyVisibility(props.items, props.query ?? '')
        },

        onKeyDown(props) {
          // popup 被隐藏时让按键透传给编辑器（用户其实在打字而非选命令）
          if (popup?.style.display === 'none') return false
          return renderer?.ref?.onKeyDown({ event: props.event }) ?? false
        },

        onExit() {
          cleanup()
        },
      }
    },
  }
}

// ===== Skill 配置 =====

export interface SkillMentionItem {
  id: string
  name: string
  description?: string
}

/** Skill query 中 CJK 字符数超过此值就隐藏 popup（≤ 此值仍显示，没匹配时显示「无匹配 Skill」占位）。 */
const SKILL_QUERY_CJK_VISIBLE_LIMIT = 8
/** CJK：汉字（中日韩统一表意） + 日文平假名/片假名。韩文谚文暂不算（实际场景少且 skill 名通常英文）。 */
const CJK_RANGE_REGEX = /[一-鿿぀-ゟ゠-ヿ]/g

export function createSkillMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<SkillMentionItem>(
    {
      char: '/',
      emptyText: '无匹配 Skill',
      fetchItems: async (slug, q) => {
        const caps = await window.electronAPI.getWorkspaceCapabilities(slug)
        return caps.skills
          .filter((s) => s.enabled)
          .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.slug ?? '').toLowerCase().includes(q))
          .map((s) => ({ id: s.slug, name: s.name, description: s.description }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Sparkles className="size-3.5 text-violet-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          {item.description && (
            <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.description}</span>
          )}
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
      // 中文 IME 输入正文时不应一直挡着：query 里 CJK 字符数 > 阈值 就隐藏 popup。
      // ≤ 阈值时保持原行为（有匹配显示列表，无匹配显示"无匹配 Skill"占位）。
      shouldHidePopup: (_items, query) => {
        const cjkCount = query.match(CJK_RANGE_REGEX)?.length ?? 0
        return cjkCount > SKILL_QUERY_CJK_VISIBLE_LIMIT
      },
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

// ===== MCP 配置 =====

export interface McpMentionItem {
  id: string
  name: string
  type: string
}

export function createMcpMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<McpMentionItem>(
    {
      char: '#',
      emptyText: '无匹配 MCP 服务',
      fetchItems: async (slug, q) => {
        const caps = await window.electronAPI.getWorkspaceCapabilities(slug)
        return caps.mcpServers
          .filter((s) => s.enabled)
          .filter((s) => !q || s.name.toLowerCase().includes(q))
          .map((s) => ({ id: s.name, name: s.name, type: s.type }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Server className="size-3.5 text-emerald-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.type}</span>
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

// ===== Agent 会话引用配置 =====

export type SessionMentionItem = AgentSessionReferenceSearchResult

export function createSessionMentionSuggestion(
  workspaceIdRef: React.RefObject<string | null>,
  currentSessionIdRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<SessionMentionItem>(
    {
      char: '&',
      emptyText: '无匹配会话',
      fetchItems: async (_slug, q) => {
        const workspaceId = workspaceIdRef.current
        if (!workspaceId) return []
        return window.electronAPI.searchAgentSessionReferences({
          workspaceId,
          excludeSessionId: currentSessionIdRef.current ?? undefined,
          query: q,
          limit: 20,
        })
      },
      keyExtractor: (item) => item.sessionId,
      renderItem: (item) => (
        <>
          <MessageSquareText className="size-3.5 text-sky-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.title}</span>
          {item.snippet && (
            <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.snippet}</span>
          )}
        </>
      ),
      toCommand: (item) => ({ id: item.sessionId, label: item.title }),
    },
    // 会话引用不依赖 slug，但复用通用 mention 工厂时需要一个非空 ref 才会触发 fetchItems。
    workspaceIdRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}
